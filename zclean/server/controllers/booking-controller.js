const sequelize = require('../models/db');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const dl = require('../utils/sql-dialect');
const { bookingLockReason } = require('../utils/booking-guards');
const { resolveTransportFee } = require('../utils/transport-fee');
const { resolveAreaSurcharge } = require('../utils/area-surcharge');
const { syncPaymentStatus, getReservationFee } = require('../utils/payment-status');
const { sendBookingConfirmation, sendBookingConfirmedEmail } = require('../utils/mailer');

// ── Helper: create a client notification ─────────────────────────────────────
const createNotification = async (userId, bookingId, message, type = 'info') => {
  try {
    await sequelize.query(
      'INSERT INTO client_notifications (user_id, booking_id, message, type) VALUES (?,?,?,?)',
      { replacements: [userId, bookingId, message, type] }
    );
  } catch (e) {
    console.error('createNotification error:', e.message);
  }
};

// ── POST /api/bookings ────────────────────────────────────────────────────────
exports.createBooking = async (req, res) => {
  const { service_id, date, time_start, location, notes, payment_method, sqm_range, area_surcharge, transport_fee } = req.body;
  // addon_ids comes as array from FormData (multiple fields named addon_ids)
  let addon_ids = req.body.addon_ids || [];
  if (!Array.isArray(addon_ids)) addon_ids = [addon_ids];
  addon_ids = addon_ids.map(Number).filter(Boolean);

  const client_id = req.user.id;
  if (!service_id || !date || !time_start || !location)
    return res.status(400).json({ message: 'Service, date, time, and location are required.' });

  // ── Date guards (authoritative) ──────────────────────────────────────────
  // The booking calendar disables these dates for UX, but the API must reject
  // them regardless — a stale page or a direct request must not slip through.
  // Rule: past dates are never bookable, and today closes once its 9:00 AM
  // service start has passed, since there is no remaining slot to fill.
  // Local date built from parts, NOT toISOString(), which is UTC and would
  // report the previous day between midnight and 8 AM Philippine time.
  const SERVICE_START_HOUR = 9;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const bookDate = String(date).slice(0, 10);
  if (bookDate < todayStr)
    return res.status(400).json({ message: 'That date has already passed. Please choose another date.' });
  if (bookDate === todayStr && now.getHours() >= SERVICE_START_HOUR)
    return res.status(400).json({ message: "Same-day booking is closed — today's 9:00 AM slot has already started. Please choose another date." });

  try {
    const [service] = await sequelize.query(
      // price is read too, because the area surcharge is a percentage of it.
      'SELECT price, duration_hrs FROM services WHERE id = ? AND is_active = TRUE',
      { replacements: [service_id], type: sequelize.QueryTypes.SELECT }
    );
    if (!service) return res.status(404).json({ message: 'Service not found.' });

    // Split on ':' and take the parts. The old form stripped ':00' first, so a
    // time sent as '10:00' rather than '10:00:00' lost its minutes and produced
    // a time_end of "NaN:NaN:00".
    const [h, m] = String(time_start).split(':').map(Number);
    const endDate = new Date(0, 0, 0, h + service.duration_hrs, m || 0);
    const time_end = `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}:00`;

    // A booking is only held once the reservation has been sent, so the receipt
    // is required for EVERY client booking — `payment_method` now refers to how
    // the remaining balance will be settled, not to whether anything was paid.
    // Enforced here as well as in the form: a stale page or a direct request
    // must not create an unreserved booking.
    if (!req.file)
      return res.status(400).json({ message: 'Please upload your GCash reservation receipt to confirm the booking.' });

    const gcash_receipt = `/uploads/receipts/${req.file.filename}`;
    const method = payment_method || 'cash';
    // Both money figures are looked up on the server, never taken from the
    // request, so the stored total always matches the admin's own settings.
    // These two read different settings and do not depend on each other, so
    // they go to the database together rather than one after the other.
    const [fee, surcharge] = await Promise.all([
      resolveTransportFee(location),
      resolveAreaSurcharge(sqm_range, service.price),
    ]);

    // ── Availability + insert, as ONE atomic step ───────────────────────────
    // The checks and the insert used to be separate statements. Two people
    // booking the last slot of a day at the same moment could therefore both
    // read "1 booking so far", both pass, and both insert — putting three jobs
    // on a day with a crew for two. It needs simultaneity, so it is rare, but a
    // demo with two browsers open can produce it, and the whole point of the
    // system is that double-booking cannot happen.
    //
    // A lock named after the DATE serialises requests for that one day: the
    // second waits for the first to finish, then counts again and is correctly
    // refused. Bookings for other dates are unaffected.
    const t = await sequelize.transaction();
    let bookingId;
    try {
      if (dl.isPg) {
        // Released automatically when the transaction ends, however it ends.
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(?))',
          { replacements: [bookDate], transaction: t });
      } else {
        // MySQL equivalent; waits up to 5 seconds for the other request.
        await sequelize.query('SELECT GET_LOCK(?, 5) AS got',
          { replacements: [`zclean_day_${bookDate}`], transaction: t });
      }

      // Blocked dates (authoritative). The booking calendar greys these out, but
      // nothing stopped a stale page or a direct API call from booking a date
      // the admin had explicitly closed — the same client-only-enforcement gap
      // the same-day cutoff had. This is the server half of the study's
      // "automated scheduling with conflict prevention" objective.
      const [blocked] = await sequelize.query(
        'SELECT reason FROM blocked_dates WHERE date = ?',
        { replacements: [bookDate], type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      if (blocked) {
        await t.rollback();
        return res.status(409).json({
          message: blocked.reason
            ? `That date is unavailable (${blocked.reason}). Please choose another date.`
            : 'That date is unavailable. Please choose another date.',
        });
      }

      // Max 2 bookings per day — a capacity limit, not a time-overlap check:
      // every service starts at 9:00 AM, so daily capacity IS the conflict rule.
      const [[dayCount]] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM bookings WHERE date = ? AND status IN ('pending','confirmed')",
        { replacements: [bookDate], transaction: t }
      );
      if (parseInt(dayCount.cnt) >= 2) {
        await t.rollback();
        return res.status(409).json({ message: 'This date is fully booked (max 2 services per day). Please choose another date.' });
      }

      bookingId = await dl.insertGetId(sequelize,
        `INSERT INTO bookings (client_id, service_id, date, time_start, time_end, location, status, notes, payment_method, gcash_receipt, payment_status, sqm_range, area_surcharge, transport_fee)
         VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)`,
        [
          client_id, service_id, date, time_start, time_end, location,
          notes || null, method, gcash_receipt,
          // Every booking now arrives with a reservation receipt awaiting the
          // admin's check, whichever way the balance will be paid.
          'pending_verification',
          sqm_range || 'under_100',
          surcharge,
          fee,
        ],
        { transaction: t });

      // Add-ons belong to the same step: a booking saved without them would be
      // quoted at the wrong price.
      for (const aid of addon_ids) {
        await sequelize.query(
          dl.insertIgnore('booking_global_addons', 'booking_id, addon_id', '?,?', 'booking_id, addon_id'),
          { replacements: [bookingId, aid], transaction: t }
        );
      }

      if (!dl.isPg) {
        // MySQL named locks are tied to the CONNECTION, so the release must run
        // on the same one — i.e. inside this transaction, before it ends.
        // Releasing afterwards took an arbitrary pooled connection and freed
        // nothing, leaving the lock held until that connection was recycled.
        await sequelize.query('SELECT RELEASE_LOCK(?)',
          { replacements: [`zclean_day_${bookDate}`], transaction: t }).catch(() => {});
      }
      await t.commit();
    } catch (txErr) {
      // Nothing is half-saved: the whole booking is rolled back together.
      // `finished` guards the case where commit() itself threw — rolling back
      // an already-finished transaction throws a second error that would mask
      // the real one.
      if (!t.finished) await t.rollback().catch(() => {});
      throw txErr;
    }

    // ── Answer the client NOW ───────────────────────────────────────────────
    // The booking is committed, so it exists. Everything below is after-care:
    // an in-app notification and a confirmation email.
    //
    // These used to run BEFORE this response, and the email was awaited despite
    // a comment calling it non-blocking. The browser therefore sat on the
    // spinner through two more queries and a full Gmail handshake — which is
    // why the confirmation arrived while the booking page was still loading,
    // and why an impatient client could press Submit a second time.
    res.status(201).json({ message: 'Booking submitted successfully.', booking_id: bookingId });

    // ── After-care, with nobody waiting on it ───────────────────────────────
    (async () => {
      try {
        await createNotification(
          client_id, bookingId,
          `Your booking #${bookingId} has been submitted and is pending confirmation.`,
          'booking'
        );
      } catch (e) { console.warn('Notification error:', e.message); }

      try {
        // Independent lookups — fetched together.
        const [[user], [svcInfo]] = await Promise.all([
          sequelize.query('SELECT name, email FROM users WHERE id = ?',
            { replacements: [client_id], type: sequelize.QueryTypes.SELECT }),
          sequelize.query('SELECT name FROM services WHERE id = ?',
            { replacements: [service_id], type: sequelize.QueryTypes.SELECT }),
        ]);
        await sendBookingConfirmation({
          to: user.email, name: user.name, bookingId, serviceName: svcInfo.name,
          date, timeStart: time_start, location, paymentMethod: method,
        });
      } catch (e) { console.warn('Email error:', e.message); }
    })();
  } catch (e) {
    console.error('createBooking error:', e.message);
    // The success response is now sent before the after-care runs, so guard
    // against answering twice — a second send would throw "Cannot set headers
    // after they are sent" and bury the original error.
    if (!res.headersSent)
      res.status(500).json({ message: 'Failed to create booking.' });
  }
};

// ── GET /api/bookings (admin) ─────────────────────────────────────────────────
exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await sequelize.query(`
      SELECT b.*,
             u.name AS client_name, u.email AS client_email, u.phone AS client_phone,
             s.name AS service_name, s.price AS service_price, s.duration_hrs,
             ${dl.groupConcat('ga.name', ', ')} AS addons_summary,
             -- Authoritative booking total. MUST match what the client is quoted
             -- and shown on their receipt: service + add-ons + area surcharge +
             -- transport fee. Computed here (not in the UI) so the admin table,
             -- the detail view and the recorded payment amount can never drift
             -- apart from each other or from the client's figure.
             s.price
               + COALESCE((
                   SELECT SUM(ga2.price) FROM booking_global_addons bga2
                   JOIN global_addons ga2 ON ga2.id = bga2.addon_id
                   WHERE bga2.booking_id = b.id
                 ), 0)
               + COALESCE(b.area_surcharge, 0)
               + COALESCE(b.transport_fee, 0) AS total_price,
             -- Money actually received, so every view can show the balance
             -- instead of assuming a booking is either unpaid or fully paid.
             (SELECT COALESCE(SUM(p2.amount), 0) FROM payments p2
               WHERE p2.booking_id = b.id) AS amount_paid
      FROM bookings b
      JOIN users    u  ON u.id = b.client_id
      JOIN services s  ON s.id = b.service_id
      LEFT JOIN booking_global_addons bga ON bga.booking_id = b.id
      LEFT JOIN global_addons         ga  ON ga.id = bga.addon_id
      GROUP BY b.id, u.id, s.id
      ORDER BY b.created_at DESC
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(bookings);
  } catch (e) {
    console.error('getAllBookings error:', e.message);
    res.status(500).json({ message: 'Failed to fetch bookings.' });
  }
};

// ── GET /api/bookings/my (client) ─────────────────────────────────────────────
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await sequelize.query(`
      SELECT b.id, b.client_id, b.service_id, b.date, b.time_start, b.time_end,
             b.location, b.status, b.notes, b.payment_method, b.payment_status,
             b.gcash_receipt, b.sqm_range, b.area_surcharge, b.transport_fee,
             b.created_at,
             COALESCE(b.proposed_date, NULL) AS proposed_date,
             COALESCE(b.proposed_time, NULL) AS proposed_time,
             s.name AS service_name, s.price AS service_price, s.duration_hrs,
             ${dl.groupConcat("CONCAT(ga.name,'|',ga.price)", ';;')} AS addons_raw,
             -- Authoritative total (service + add-ons + surcharge + transport),
             -- identical to the admin list and the confirmation email.
             s.price
               + COALESCE((
                   SELECT SUM(ga2.price) FROM booking_global_addons bga2
                   JOIN global_addons ga2 ON ga2.id = bga2.addon_id
                   WHERE bga2.booking_id = b.id
                 ), 0)
               + COALESCE(b.area_surcharge, 0)
               + COALESCE(b.transport_fee, 0) AS total_price,
             -- Money actually received, so every view can show the balance
             -- instead of assuming a booking is either unpaid or fully paid.
             (SELECT COALESCE(SUM(p2.amount), 0) FROM payments p2
               WHERE p2.booking_id = b.id) AS amount_paid,
             r.id AS review_id, r.rating, r.comment AS review_comment
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      LEFT JOIN booking_global_addons bga ON bga.booking_id = b.id
      LEFT JOIN global_addons         ga  ON ga.id = bga.addon_id
      LEFT JOIN reviews               r   ON r.booking_id = b.id
      WHERE b.client_id = ?
      GROUP BY b.id, s.id, r.id
      ORDER BY b.created_at DESC
    `, { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT });
    res.json(bookings);
  } catch (e) {
    console.error('getMyBookings error:', e.message);
    // If proposed_date column doesn't exist yet (migration not run), fall back to query without it
    try {
      const bookings = await sequelize.query(`
        SELECT b.id, b.client_id, b.service_id, b.date, b.time_start, b.time_end,
               b.location, b.status, b.notes, b.payment_method, b.payment_status,
               b.gcash_receipt, b.created_at,
               NULL AS proposed_date, NULL AS proposed_time,
               s.name AS service_name, s.price AS service_price, s.duration_hrs,
               ${dl.groupConcat("CONCAT(ga.name,'|',ga.price)", ';;')} AS addons_raw,
               r.id AS review_id, r.rating, r.comment AS review_comment
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        LEFT JOIN booking_global_addons bga ON bga.booking_id = b.id
        LEFT JOIN global_addons         ga  ON ga.id = bga.addon_id
        LEFT JOIN reviews               r   ON r.booking_id = b.id
        WHERE b.client_id = ?
        GROUP BY b.id, s.id, r.id
        ORDER BY b.created_at DESC
      `, { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT });
      res.json(bookings);
    } catch (e2) {
      res.status(500).json({ message: 'Failed to fetch your bookings.' });
    }
  }
};

// ── PATCH /api/bookings/:id/status (admin) ────────────────────────────────────
exports.updateBookingStatus = async (req, res) => {
  const { status } = req.body;
  // 'completed' is intentionally NOT settable by hand: it means "performed AND
  // paid", and is derived from the payment record so the two can never drift.
  const allowed = ['pending','confirmed','done','pending_reschedule'];
  if (!allowed.includes(status))
    return res.status(400).json({ message: 'Invalid status.' });
  try {
    const locked = await bookingLockReason(req.params.id);
    if (locked) return res.status(409).json({ message: locked });

    // ── Order-of-work rules, enforced here and not only in the UI ──────────
    // The admin screen greys these buttons out, but a stale page or a direct
    // request must not be able to skip a step.
    const [bk0] = await sequelize.query(
      'SELECT date, payment_status FROM bookings WHERE id = ?',
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!bk0) return res.status(404).json({ message: 'Booking not found.' });

    // A slot is only held once the reservation has been checked. Confirming
    // before that promises the date for money nobody has verified.
    if (status === 'confirmed' && bk0.payment_status === 'pending_verification')
      return res.status(409).json({
        message: 'Verify the GCash receipt before confirming this booking.',
      });

    // A service cannot be performed before the day it is booked for.
    if (status === 'done') {
      const bookDate = String(bk0.date).slice(0, 10);
      const todayStr = new Date().toLocaleDateString('en-CA');   // local, not UTC
      if (bookDate > todayStr)
        return res.status(409).json({
          message: `This service is booked for ${bookDate}. It can be marked done on that day.`,
        });
    }

    // Marking a job done that has already been paid for settles it outright.
    let finalStatus = status;
    if (status === 'done') {
      const [pay] = await sequelize.query(
        'SELECT payment_status FROM bookings WHERE id = ?',
        { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
      );
      if (pay?.payment_status === 'paid') finalStatus = 'completed';
    }
    await sequelize.query(
      'UPDATE bookings SET status = ? WHERE id = ?',
      { replacements: [finalStatus, req.params.id] }
    );
    // Notify client
    const bkRows = await sequelize.query(
      `SELECT b.client_id, b.date, b.time_start, b.location, b.payment_method,
              u.name AS client_name, u.email AS client_email,
              s.name AS service_name, s.price AS service_price,
              -- Same authoritative total as the bookings list and the client's
              -- receipt: service + add-ons + area surcharge + transport fee.
              -- Emailing s.price alone quoted the client the wrong amount.
              s.price
                + COALESCE((
                    SELECT SUM(ga.price) FROM booking_global_addons bga
                    JOIN global_addons ga ON ga.id = bga.addon_id
                    WHERE bga.booking_id = b.id
                  ), 0)
                + COALESCE(b.area_surcharge, 0)
                + COALESCE(b.transport_fee, 0) AS total_price
       FROM bookings b
       JOIN users    u ON u.id = b.client_id
       JOIN services s ON s.id = b.service_id
       WHERE b.id = ?`,
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    const bk = bkRows[0];
    if (bk) {
      const msgs = {
        confirmed: 'Your booking has been confirmed!',
        done:      'Your service has been completed. Payment is still outstanding — thank you!',
        completed: 'Your service is complete and payment received. Thank you!',
      };
      // ── Notify and email WITHOUT holding up the admin ────────────────────
      // Both of these used to be awaited before the response. The email in
      // particular is a full SMTP exchange, and on a host that blocks outbound
      // SMTP it does not fail quickly — it hangs until the socket times out,
      // which is why confirming a booking took so long. The status is already
      // saved by this point, so neither step needs the admin waiting on it.
      (async () => {
        try {
          if (msgs[finalStatus])
            await createNotification(bk.client_id, parseInt(req.params.id),
                                     msgs[finalStatus], finalStatus);
        } catch (e) { console.warn('Notification error:', e.message); }

        if (status === 'confirmed') {
          try {
            await sendBookingConfirmedEmail({
              to:            bk.client_email,
              name:          bk.client_name,
              bookingId:     req.params.id,
              serviceName:   bk.service_name,
              date:          bk.date,
              timeStart:     '9:00 AM',
              location:      bk.location,
              paymentMethod: bk.payment_method,
              total:         bk.total_price,
            });
          } catch (e) { console.warn('Confirmed email error:', e.message); }
        }
      })();
    }
    res.json({ message: 'Booking status updated.' });
  } catch (e) {
    console.error('updateBookingStatus error:', e.message);
    res.status(500).json({ message: 'Failed to update status.' });
  }
};

// ── PATCH /api/bookings/:id/house-size (admin) ───────────────────────────────
// The business checks the house before the cleaning day. If it turns out to be
// bigger (or smaller) than the client declared, the SIZE is corrected here and
// the total recalculates from it — service + area charge + add-ons + transport.
//
// Deliberately not a "final price" field. Replacing the whole total with one
// number would leave the client a figure with no explanation and a receipt that
// no longer adds up; correcting the size keeps every line traceable, and the
// client sees exactly which charge changed and why.
//
// The area charge is recomputed from the admin's own percentage settings, so
// it stays consistent with what a client booking that size would be quoted. An
// explicit amount may be passed for a house that doesn't fit the bands.
exports.setHouseSize = async (req, res) => {
  const { sqm_range, area_surcharge, price_note } = req.body;
  const VALID = ['under_100', '100_200', '200_plus'];
  if (!VALID.includes(sqm_range))
    return res.status(400).json({ message: 'Choose the house size.' });
  if (price_note && String(price_note).length > 255)
    return res.status(400).json({ message: 'Please keep the reason under 255 characters.' });

  try {
    const locked = await bookingLockReason(req.params.id);
    if (locked) return res.status(409).json({ message: locked });

    const [bk] = await sequelize.query(
      `SELECT b.client_id, b.status, b.payment_status, s.price AS service_price
         FROM bookings b JOIN services s ON s.id = b.service_id
        WHERE b.id = ?`,
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!bk) return res.status(404).json({ message: 'Booking not found.' });

    // The size is judged at the ocular inspection, which happens after the
    // booking is confirmed.
    if (bk.status === 'pending')
      return res.status(409).json({
        message: 'Confirm the booking before setting the house size.',
      });
    // Once the whole amount is in, the price is settled and the figures are
    // part of the records — changing the size then would rewrite history.
    if (bk.payment_status === 'paid')
      return res.status(409).json({
        message: 'This booking is fully paid, so its price can no longer be changed.',
      });

    // A typed amount wins; otherwise the percentage for that size is applied to
    // the service price, exactly as the booking form would have done.
    const typed  = parseFloat(area_surcharge);
    const charge = Number.isFinite(typed) && typed >= 0
      ? Math.round(typed * 100) / 100
      : await resolveAreaSurcharge(sqm_range, bk.service_price);

    await sequelize.query(
      // NOW() is valid in both PostgreSQL and MySQL, so no dialect switch needed.
      'UPDATE bookings SET sqm_range = ?, area_surcharge = ?, price_note = ?, priced_at = NOW() WHERE id = ?',
      { replacements: [sqm_range, charge, price_note?.trim() || null, req.params.id] }
    );

    // The total just changed, so what is owed changed with it: a booking settled
    // on the old size can go back to 'partial', and vice versa.
    const summary = await syncPaymentStatus(req.params.id);

    const LABEL = { under_100: 'under 100 sqm', '100_200': '100–200 sqm', '200_plus': 'above 200 sqm' };
    await createNotification(
      bk.client_id, parseInt(req.params.id),
      `After checking your property, booking #${req.params.id} is priced for ${LABEL[sqm_range]}. `
        + `New total: ₱${(summary?.total || 0).toLocaleString()}`
        + (summary?.balance > 0 ? ` — balance ₱${summary.balance.toLocaleString()}.` : '.'),
      'payment'
    );

    res.json({
      message: `Updated to ${LABEL[sqm_range]} — area charge ₱${charge.toLocaleString()}, total ₱${(summary?.total || 0).toLocaleString()}.`,
      area_surcharge: charge,
      ...summary,
    });
  } catch (e) {
    console.error('setHouseSize error:', e.message);
    res.status(500).json({ message: 'Failed to update the house size.' });
  }
};

// cancelBooking removed — no cancellation allowed

// ── PATCH /api/bookings/:id/verify-gcash (admin) ─────────────────────────────
exports.verifyGcash = async (req, res) => {
  try {
    const locked = await bookingLockReason(req.params.id);
    if (locked) return res.status(409).json({ message: locked });
    // What the client sent by GCash is normally the RESERVATION, not the whole
    // bill, so verifying records that amount as a payment rather than declaring
    // the booking settled. The admin can pass a different amount if the client
    // sent more (an advance payment) or less.
    const amount = parseFloat(req.body?.amount) > 0
      ? parseFloat(req.body.amount)
      : await getReservationFee();

    // Don't record a second time if the receipt is verified twice.
    const [already] = await sequelize.query(
      "SELECT COUNT(*) AS n FROM payments WHERE booking_id = ? AND method = 'GCash'",
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!Number(already?.n)) {
      await sequelize.query(
        "INSERT INTO payments (booking_id, amount, method) VALUES (?,?,'GCash')",
        { replacements: [req.params.id, amount] }
      );
    }
    // Recalculates unpaid / partial / paid, and settles the job only if the
    // total is now covered.
    const summary = await syncPaymentStatus(req.params.id);

    const [bk] = await sequelize.query('SELECT client_id FROM bookings WHERE id = ?', { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT });
    if (bk) await createNotification(
      bk.client_id, parseInt(req.params.id),
      summary?.balance > 0
        ? `Your GCash payment of ₱${amount.toLocaleString()} has been verified. Remaining balance: ₱${summary.balance.toLocaleString()}.`
        : 'Your GCash payment has been verified!',
      'payment'
    );
    if (!summary)
      return res.status(500).json({ message: 'Payment recorded, but the booking total could not be recalculated.' });
    res.json({
      message: summary.balance > 0
        ? `GCash payment verified. Balance: ₱${summary.balance.toLocaleString()}.`
        : 'GCash payment verified. Fully paid.',
      ...summary,
    });
  } catch (e) {
    res.status(500).json({ message: 'Failed to verify payment.' });
  }
};

// ── PATCH /api/bookings/:id/reschedule (admin proposes reschedule) ────────────

// Shared availability rule for a proposed date. Used both when the admin
// proposes a reschedule and again when the client accepts it — the gap between
// those two moments can be days, during which the date may fill up or be
// blocked, so checking only at proposal time is not enough.
//
// `excludeId` is the booking being moved: it must not count against the
// capacity of a date it is already on.
const dateUnavailableReason = async (dateStr, excludeId) => {
  const [blocked] = await sequelize.query(
    'SELECT reason FROM blocked_dates WHERE date = ?',
    { replacements: [dateStr], type: sequelize.QueryTypes.SELECT }
  );
  if (blocked)
    return blocked.reason
      ? `That date is blocked (${blocked.reason}). Unblock it first if you want to schedule on it.`
      : 'That date is blocked. Unblock it first if you want to schedule on it.';

  const [[cnt]] = await sequelize.query(
    "SELECT COUNT(*) AS c FROM bookings WHERE date = ? AND status IN ('pending','confirmed') AND id <> ?",
    { replacements: [dateStr, excludeId || 0] }
  );
  if (parseInt(cnt.c) >= 2)
    return 'That date is already fully booked (max 2 services per day).';

  return null;
};


// ── POST /api/bookings/admin — walk-in / phone booking ───────────────────────
// Z's clients still call to book. This lets the admin record that call directly
// instead of asking the customer to go online, which is the behaviour the
// system is meant to replace.
//
// Differs from the client-facing createBooking in three ways:
//   1. client_id comes from the request, not the session (the admin is booking
//      on someone else's behalf).
//   2. Status is 'confirmed' immediately — taking the call IS the acceptance.
//   3. A brand-new caller can be created inline. Email is optional: the users
//      table requires a unique address, so a placeholder is generated when the
//      caller has none. No mail is sent to placeholders.
//
// Date rules are deliberately IDENTICAL to the client path. A phone booking
// must not be allowed to overbook the crew or land on a blocked date.
exports.adminCreateBooking = async (req, res) => {
  // `reservation_paid` is ticked by the admin when the caller has already sent
  // the ₱500 before she records the booking. A phone booking otherwise starts
  // unpaid: the caller has sent nothing at the moment she is typing.
  let {
    client_id, new_client, service_id, date, time_start, location, notes,
    payment_method, sqm_range, area_surcharge, transport_fee, addon_ids,
    reservation_paid, reservation_amount,
  } = req.body;

  if (!Array.isArray(addon_ids)) addon_ids = addon_ids ? [addon_ids] : [];
  addon_ids = addon_ids.map(Number).filter(Boolean);

  if (!service_id || !date || !time_start || !location)
    return res.status(400).json({ message: 'Service, date, time, and location are required.' });
  if (!client_id && !new_client?.name?.trim())
    return res.status(400).json({ message: 'Choose an existing client or enter the caller\'s name.' });

  const bookDate = String(date).slice(0, 10);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (bookDate < todayStr)
    return res.status(400).json({ message: 'That date has already passed. Please choose another date.' });
  if (bookDate === todayStr && now.getHours() >= 9)
    return res.status(400).json({ message: "Today's 9:00 AM slot has already started. Please choose another date." });

  try {
    // Same blocked-date and capacity rules as every other path.
    const unavailable = await dateUnavailableReason(bookDate, 0);
    if (unavailable) return res.status(409).json({ message: unavailable });

    // Create the caller's record if they are not an existing client.
    let bookingClientId = client_id;
    let clientEmail = null;
    let clientName  = null;

    if (!bookingClientId) {
      const name  = new_client.name.trim();
      const phone = (new_client.phone || '').trim() || null;
      const typed = (new_client.email || '').trim().toLowerCase();

      if (typed) {
        const [exists] = await sequelize.query(
          'SELECT id FROM users WHERE LOWER(email) = ?',
          { replacements: [typed], type: sequelize.QueryTypes.SELECT }
        );
        if (exists)
          return res.status(409).json({ message: 'That email already belongs to a client — select them from the list instead.' });
      }

      // Placeholder keeps the UNIQUE NOT NULL constraint satisfied for callers
      // without email. The .invalid TLD is reserved by RFC 2606 precisely so it
      // can never resolve, making an accidental send impossible.
      const email = typed || `walkin-${Date.now()}@zclean.invalid`;
      // Random password: the account exists but is not usable until the person
      // sets one via Forgot Password — the admin never handles a credential.
      const hashed = await bcrypt.hash(crypto.randomBytes(12).toString('hex'), 10);

      bookingClientId = await dl.insertGetId(sequelize,
        'INSERT INTO users (name, email, phone, password, role) VALUES (?,?,?,?,?)',
        [name, email, phone, hashed, 'client']);

      clientName  = name;
      clientEmail = typed || null;   // null = placeholder, never email it
    } else {
      const [u] = await sequelize.query(
        'SELECT name, email FROM users WHERE id = ? AND role = ?',
        { replacements: [bookingClientId, 'client'], type: sequelize.QueryTypes.SELECT }
      );
      if (!u) return res.status(404).json({ message: 'Client not found.' });
      clientName  = u.name;
      clientEmail = String(u.email).endsWith('@zclean.invalid') ? null : u.email;
    }

    const [service] = await sequelize.query(
      'SELECT name, price, duration_hrs FROM services WHERE id = ? AND is_active = TRUE',
      { replacements: [service_id], type: sequelize.QueryTypes.SELECT }
    );
    if (!service) return res.status(404).json({ message: 'Service not found.' });

    const start   = new Date(`2000-01-01T${time_start}`);
    const endDate = new Date(start.getTime() + (service.duration_hrs || 3) * 3600000);
    const time_end = `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}:00`;

    // ── Same atomic capacity guard as the client path ───────────────────────
    // The availability check above runs before the client record is created,
    // so minutes can pass before the insert. Without the lock, a phone booking
    // racing an online one (or the admin double-submitting) could put three
    // jobs on a day with a crew for two — the exact thing the client path was
    // hardened against, left open here.
    const surcharge = await resolveAreaSurcharge(sqm_range, service.price);
    const fee       = await resolveTransportFee(location);

    const t = await sequelize.transaction();
    let bookingId;
    try {
      if (dl.isPg) {
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(?))',
          { replacements: [bookDate], transaction: t });
      } else {
        await sequelize.query('SELECT GET_LOCK(?, 5) AS got',
          { replacements: [`zclean_day_${bookDate}`], transaction: t });
      }

      // Re-check inside the lock: the picture may have changed since above.
      const [[dayCount]] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM bookings WHERE date = ? AND status IN ('pending','confirmed')",
        { replacements: [bookDate], transaction: t }
      );
      if (parseInt(dayCount.cnt) >= 2) {
        await t.rollback();
        return res.status(409).json({ message: 'That date is already fully booked (max 2 services per day).' });
      }

      bookingId = await dl.insertGetId(sequelize,
        `INSERT INTO bookings (client_id, service_id, date, time_start, time_end, location, status, notes, payment_method, payment_status, sqm_range, area_surcharge, transport_fee)
         VALUES (?,?,?,?,?,?,'confirmed',?,?, 'unpaid', ?,?,?)`,
        [
          bookingClientId, service_id, bookDate, time_start, time_end, location,
          notes || null, payment_method || 'cash',
          sqm_range || 'under_100',
          surcharge,
          fee,
        ],
        { transaction: t });

      if (!dl.isPg) {
        await sequelize.query('SELECT RELEASE_LOCK(?)',
          { replacements: [`zclean_day_${bookDate}`], transaction: t }).catch(() => {});
      }
      await t.commit();
    } catch (txErr) {
      if (!t.finished) await t.rollback().catch(() => {});
      throw txErr;
    }

    for (const aid of addon_ids) {
      await sequelize.query(
        dl.insertIgnore('booking_global_addons', 'booking_id, addon_id', '?,?', 'booking_id, addon_id'),
        { replacements: [bookingId, aid] }
      );
    }

    // The caller already sent the reservation, so record it as a real payment
    // rather than leaving the booking looking unpaid. The amount is the
    // reservation from settings — the only figure a caller sends at this point.
    // (An explicit amount is still accepted here for older callers of this API,
    // but the admin screen no longer sends one.)
    if (reservation_paid) {
      const typed  = parseFloat(reservation_amount);
      const amount = Number.isFinite(typed) && typed > 0 ? typed : await getReservationFee();
      await sequelize.query(
        'INSERT INTO payments (booking_id, amount, method) VALUES (?,?,?)',
        { replacements: [bookingId, amount, payment_method === 'gcash' ? 'GCash' : 'Cash'] }
      );
      // Works out unpaid / partial / paid from what is now recorded, the same
      // way a client booking does.
      await syncPaymentStatus(bookingId);
    }

    await createNotification(
      bookingClientId, bookingId,
      `Your ${service.name} booking on ${bookDate} has been confirmed.`,
      'confirmed'
    );

    // Only real addresses get mail; placeholders are skipped entirely.
    if (clientEmail) {
      const [totals] = await sequelize.query(
        `SELECT s.price + COALESCE((
            SELECT SUM(ga.price) FROM booking_global_addons bga
            JOIN global_addons ga ON ga.id = bga.addon_id WHERE bga.booking_id = ?
          ), 0) + COALESCE(b.area_surcharge,0) + COALESCE(b.transport_fee,0) AS total_price
         FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.id = ?`,
        { replacements: [bookingId, bookingId], type: sequelize.QueryTypes.SELECT }
      );
      sendBookingConfirmedEmail({
        to: clientEmail, name: clientName, bookingId,
        serviceName: service.name, date: bookDate, timeStart: time_start,
        location, paymentMethod: payment_method || 'cash',
        total: totals?.total_price,
      }).catch(e => console.warn('Walk-in confirmation email failed:', e.message));
    }

    res.status(201).json({
      message: clientEmail
        ? 'Booking created and confirmed. A confirmation email has been sent.'
        : 'Booking created and confirmed. No email was sent (no address on file).',
      booking_id: bookingId,
    });
  } catch (e) {
    console.error('adminCreateBooking error:', e.message);
    res.status(500).json({ message: 'Failed to create the booking.' });
  }
};

exports.rescheduleBooking = async (req, res) => {
  const { date, time_start } = req.body;
  if (!date || !time_start) return res.status(400).json({ message: 'Date and time are required.' });

  // A proposed reschedule must be in the future — offering the client a date
  // that has already passed is never valid, and the client's accept/decline
  // would then move the booking backwards in time.
  // Blocked dates are deliberately NOT rejected here: the admin owns the
  // blocked-date calendar, so proposing one is treated as a considered
  // override rather than a mistake.
  // Local date parts, not toISOString() — that returns UTC and would report
  // yesterday between midnight and 8 AM Philippine time.
  {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const proposed = String(date).slice(0, 10);
    if (proposed < todayStr)
      return res.status(400).json({ message: 'The proposed date has already passed. Please choose a future date.' });
    if (proposed === todayStr && now.getHours() >= 9)
      return res.status(400).json({ message: "Today's 9:00 AM slot has already started. Please propose a later date." });
  }

  try {
    const locked = await bookingLockReason(req.params.id);
    if (locked) return res.status(409).json({ message: locked });

    const unavailable = await dateUnavailableReason(String(date).slice(0, 10), req.params.id);
    if (unavailable) return res.status(409).json({ message: unavailable });

    // Store proposed date/time and set status to pending_reschedule
    // The actual date/time does NOT change until client confirms
    await sequelize.query(
      "UPDATE bookings SET proposed_date = ?, proposed_time = ?, status = 'pending_reschedule' WHERE id = ?",
      { replacements: [date, time_start, req.params.id] }
    );
    const [bk] = await sequelize.query(
      'SELECT client_id FROM bookings WHERE id = ?',
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (bk) {
      await createNotification(
        bk.client_id,
        parseInt(req.params.id),
        `Admin proposed rescheduling your booking to ${date}. Please confirm or decline in My Bookings.`,
        'pending_reschedule'
      );
    }
    res.json({ message: 'Reschedule proposal sent to client.' });
  } catch (e) {
    console.error('rescheduleBooking error:', e.message);
    res.status(500).json({ message: 'Failed to propose reschedule.' });
  }
};

// ── PATCH /api/bookings/:id/reschedule-response (client confirms or declines) ─
exports.respondReschedule = async (req, res) => {
  const { action } = req.body; // 'accept' or 'decline'
  if (!['accept','decline'].includes(action))
    return res.status(400).json({ message: 'Action must be accept or decline.' });
  try {
    const [bk] = await sequelize.query(
      'SELECT client_id, proposed_date, proposed_time, date, time_start, service_id FROM bookings WHERE id = ? AND status = ?',
      { replacements: [req.params.id, 'pending_reschedule'], type: sequelize.QueryTypes.SELECT }
    );
    if (!bk) return res.status(404).json({ message: 'No pending reschedule for this booking.' });
    // Only the booking owner can respond
    if (bk.client_id !== req.user.id)
      return res.status(403).json({ message: 'Not your booking.' });

    if (action === 'accept') {
      // Re-check availability. The proposal may be days old — the date could
      // have filled up or been blocked in the meantime, and applying it
      // regardless would push the day over capacity.
      const stillUnavailable = await dateUnavailableReason(
        String(bk.proposed_date).slice(0, 10), req.params.id
      );
      if (stillUnavailable)
        return res.status(409).json({
          message: `${stillUnavailable} Please contact us to arrange another date.`,
        });

      // Apply the proposed date/time, compute new time_end
      const [svc] = await sequelize.query(
        'SELECT duration_hrs FROM services WHERE id = ?',
        { replacements: [bk.service_id], type: sequelize.QueryTypes.SELECT }
      );
      const [h, m] = bk.proposed_time.split(':').map(Number);
      const endDate = new Date(0, 0, 0, h + (svc?.duration_hrs || 3), m);
      const time_end = `${String(endDate.getHours()).padStart(2,'0')}:${String(endDate.getMinutes()).padStart(2,'0')}:00`;
      await sequelize.query(
        "UPDATE bookings SET date = ?, time_start = ?, time_end = ?, status = 'confirmed', proposed_date = NULL, proposed_time = NULL WHERE id = ?",
        { replacements: [bk.proposed_date, bk.proposed_time, time_end, req.params.id] }
      );
      res.json({ message: 'Reschedule accepted. Booking updated.' });
    } else {
      // Client declines — the booking is cancelled, not reverted. The admin
      // proposed a new time because the original slot doesn't work for them,
      // so keeping the original date would leave an unserviceable job on the
      // calendar. Cancelled is terminal (see utils/booking-guards.js), and the
      // freed slot returns to availability automatically because the per-day
      // capacity check only counts 'pending' and 'confirmed'.
      await sequelize.query(
        "UPDATE bookings SET status = 'cancelled', proposed_date = NULL, proposed_time = NULL WHERE id = ?",
        { replacements: [req.params.id] }
      );
      await createNotification(
        bk.client_id, parseInt(req.params.id),
        'You declined the new schedule, so this booking has been cancelled. You can book another date anytime.',
        'cancelled'
      );
      res.json({ message: 'Reschedule declined. Booking cancelled.' });
    }
  } catch (e) {
    console.error('respondReschedule error:', e.message);
    res.status(500).json({ message: 'Failed to respond to reschedule.' });
  }
};
