const sequelize = require('../models/db');
const dl = require('../utils/sql-dialect');

exports.listClients = async (req, res) => {
  try {
    const clients = await sequelize.query(`
      SELECT u.id, u.name, u.email, u.phone, u.address, u.is_active,
             ${dl.dLabel('u.created_at')} AS joined,
             COUNT(DISTINCT b.id) AS total_bookings,
             -- 'done' alone misses every booking that has since been paid:
             -- a settled booking becomes 'completed', so counting only 'done'
             -- made the client's finished-jobs total go DOWN when they paid.
             SUM(CASE WHEN b.status IN ('done','completed') THEN 1 ELSE 0 END) AS completed,
             -- MAX() of a FORMATTED date compares text, so "Sep 05" beat
             -- "Oct 01" alphabetically and the last booking shown was wrong.
             -- Take the maximum first, then format it.
             ${dl.dLabel('MAX(b.date)')} AS last_booking,
             -- Every service this client has booked, with how many times:
             -- "Standard Clean (3); Deep Cleaning (1)". Semicolon-separated so
             -- the whole summary survives CSV export inside a single cell.
             -- Counted in its own grouped subquery, because doing it in the
             -- outer query would multiply the counts against the other joins.
             (SELECT ${dl.groupConcat("CONCAT(x.service_name, ' (', x.cnt, ')')", '; ')}
                FROM (
                  SELECT s2.name AS service_name, COUNT(*) AS cnt
                  FROM bookings b2
                  JOIN services s2 ON s2.id = b2.service_id
                  WHERE b2.client_id = u.id
                  GROUP BY s2.name
                ) x
             ) AS services_booked,
             -- Kept alongside: the single most recent service, so the export
             -- shows both the full picture and what they had done last.
             (SELECT s3.name
                FROM bookings b3
                JOIN services s3 ON s3.id = b3.service_id
                WHERE b3.client_id = u.id
                ORDER BY b3.date DESC, b3.id DESC
                LIMIT 1
             ) AS latest_service
      FROM users u
      LEFT JOIN bookings b ON b.client_id = u.id
      WHERE u.role = 'client'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(clients);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch clients.' }); }
};

// ── PATCH /api/clients/:id/status — admin deactivates / reactivates ──────────
// Deactivation is the DEFAULT way to retire an account. It blocks sign-in while
// leaving bookings, payments and reviews intact, so historic revenue figures
// stay accurate. See deleteClient below for why deletion is restricted.
exports.setClientStatus = async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean')
    return res.status(400).json({ message: 'is_active must be true or false.' });
  try {
    const [client] = await sequelize.query(
      "SELECT id, name FROM users WHERE id = ? AND role = 'client'",
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    await sequelize.query('UPDATE users SET is_active = ? WHERE id = ?',
      { replacements: [is_active, req.params.id] });

    res.json({
      message: is_active
        ? `${client.name}'s account has been reactivated.`
        : `${client.name}'s account has been deactivated. Their booking history is kept.`,
    });
  } catch (e) {
    console.error('setClientStatus error:', e.message);
    res.status(500).json({ message: 'Failed to update the account.' });
  }
};

// ── DELETE /api/clients/:id — admin removes an empty record ──────────────────
// Deliberately restricted to clients with NO bookings. The schema cascades
// users → bookings → payments, so deleting a client with history would remove
// their payments too and silently change past monthly/yearly revenue reports.
// The legitimate uses (duplicate walk-in entries, test accounts, spam
// registrations) all have zero bookings, so nothing real is lost.
exports.deleteClient = async (req, res) => {
  try {
    const [client] = await sequelize.query(
      "SELECT id, name FROM users WHERE id = ? AND role = 'client'",
      { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const [[cnt]] = await sequelize.query(
      'SELECT COUNT(*) AS c FROM bookings WHERE client_id = ?',
      { replacements: [req.params.id] }
    );
    const bookingCount = parseInt(cnt.c);
    if (bookingCount > 0)
      return res.status(409).json({
        message: `${client.name} has ${bookingCount} booking${bookingCount === 1 ? '' : 's'} on record. Deactivate the account instead so the history and payments are kept.`,
      });

    await sequelize.query('DELETE FROM users WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: `${client.name}'s record has been deleted.` });
  } catch (e) {
    console.error('deleteClient error:', e.message);
    res.status(500).json({ message: 'Failed to delete the record.' });
  }
};

// ── GET /api/clients/:id/bookings — a client's booking history ──────────────
// Lets the admin see what someone has booked when they call, instead of only a
// count. Same authoritative total used everywhere else.
exports.getClientBookings = async (req, res) => {
  try {
    const rows = await sequelize.query(`
      SELECT b.id, b.date, b.time_start, b.status, b.payment_status, b.payment_method,
             s.name AS service_name,
             s.price
               + COALESCE((
                   SELECT SUM(ga.price) FROM booking_global_addons bga
                   JOIN global_addons ga ON ga.id = bga.addon_id
                   WHERE bga.booking_id = b.id
                 ), 0)
               + COALESCE(b.area_surcharge, 0)
               + COALESCE(b.transport_fee, 0) AS total_price
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      WHERE b.client_id = ?
      ORDER BY b.date DESC
    `, { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT });
    res.json(rows);
  } catch (e) {
    console.error('getClientBookings error:', e.message);
    res.status(500).json({ message: 'Failed to fetch bookings.' });
  }
};
