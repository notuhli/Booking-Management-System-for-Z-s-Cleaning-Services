const sequelize = require('../models/db');

// ── Payment status, derived from money actually received ─────────────────────
// Before this, ANY recorded payment set the booking to 'paid', so a ₱500
// reservation marked a ₱7,300 booking as fully settled — and marking the job
// done then promoted it to 'completed', hiding an unpaid balance.
//
// Status is now worked out by comparing the sum of the payments table against
// the same authoritative total the client is quoted:
//     service + add-ons + area surcharge + transport fee
//
//   unpaid               nothing received
//   pending_verification a GCash receipt is waiting for the admin to check
//   partial              some money received, but less than the total
//   paid                 the total has been covered
//
// Booking status stays derived too: 'done' becomes 'completed' only when fully
// paid, and a 'completed' booking drops back to 'done' if a payment is later
// corrected downwards — the two can never disagree.

// Half a centavo of tolerance, so a total that rounds to 7300.00 is not left
// "unpaid by ₱0.001" through floating-point noise.
const EPSILON = 0.005;

const SUMMARY_SQL = `
  SELECT
    -- The booking's own figures decide what is owed. After the ocular
    -- inspection the admin corrects area_surcharge on the booking, so this
    -- total follows the agreed size with no separate override to consult.
    s.price
      + COALESCE((
          SELECT SUM(ga2.price) FROM booking_global_addons bga2
          JOIN global_addons ga2 ON ga2.id = bga2.addon_id
          WHERE bga2.booking_id = b.id
        ), 0)
      + COALESCE(b.area_surcharge, 0)
      + COALESCE(b.transport_fee, 0)                                   AS total,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
      WHERE p.booking_id = b.id)                                       AS paid,
    b.status,
    b.payment_status
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  WHERE b.id = ?`;

// Reads the money position of one booking without changing anything.
async function getPaymentSummary(bookingId) {
  const [row] = await sequelize.query(SUMMARY_SQL, {
    replacements: [bookingId], type: sequelize.QueryTypes.SELECT,
  });
  if (!row) return null;
  const total = parseFloat(row.total) || 0;
  const paid  = parseFloat(row.paid)  || 0;
  return {
    total, paid,
    balance: Math.max(0, Math.round((total - paid) * 100) / 100),
    status: row.status,
    payment_status: row.payment_status,
  };
}

// Recalculates and saves the payment status. Call this after any change to the
// payments of a booking.
async function syncPaymentStatus(bookingId) {
  const sum = await getPaymentSummary(bookingId);
  if (!sum) return null;

  let next;
  // `total > 0` was also required, which meant a booking priced at 0 could
  // never reach 'paid' and therefore never settle from 'done' to 'completed'.
  // Nothing owed IS paid.
  if (sum.total <= 0 || sum.paid + EPSILON >= sum.total) next = 'paid';
  else if (sum.paid > 0)                                next = 'partial';
  // Nothing received yet: keep 'pending_verification' if a receipt is waiting,
  // and keep 'rejected' if the admin has turned one down, so recalculating the
  // maths never wipes out either flag. A rejected receipt must stay visibly
  // rejected until the client uploads a replacement — silently dropping it back
  // to 'unpaid' would hide the fact that a payment was submitted and refused.
  else next = ['pending_verification', 'rejected'].includes(sum.payment_status)
    ? sum.payment_status
    : 'unpaid';

  if (next !== sum.payment_status) {
    await sequelize.query('UPDATE bookings SET payment_status = ? WHERE id = ?',
      { replacements: [next, bookingId] });
  }

  // Keep the performed/settled distinction honest in both directions.
  if (next === 'paid' && sum.status === 'done') {
    await sequelize.query("UPDATE bookings SET status = 'completed' WHERE id = ?",
      { replacements: [bookingId] });
  } else if (next !== 'paid' && sum.status === 'completed') {
    await sequelize.query("UPDATE bookings SET status = 'done' WHERE id = ?",
      { replacements: [bookingId] });
  }

  return { ...sum, payment_status: next };
}

// The reservation amount the client pays to hold a booking. Stored as a setting
// so the owner can change it without touching code.
const DEFAULT_RESERVATION_FEE = 500;
async function getReservationFee() {
  try {
    const [row] = await sequelize.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'reservation_fee'",
      { type: sequelize.QueryTypes.SELECT }
    );
    const n = parseFloat(row?.setting_value);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RESERVATION_FEE;
  } catch {
    return DEFAULT_RESERVATION_FEE;
  }
}

module.exports = { getPaymentSummary, syncPaymentStatus, getReservationFee, DEFAULT_RESERVATION_FEE };
