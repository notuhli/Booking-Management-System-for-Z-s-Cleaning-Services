const sequelize = require('../models/db');

// ── Cancelled bookings are terminal ──────────────────────────────────────────
// A booking reaches 'cancelled' when the client declines an admin-proposed
// reschedule: the admin moved it because the original slot doesn't work, so
// keeping it alive would leave an unserviceable job on the calendar.
//
// Once cancelled, nothing may modify it — no status change, no reschedule, no
// payment, no GCash verification. Every mutating endpoint routes through this
// helper so the rule can't be enforced in one place and forgotten in another.
//
// Returns an error message when the booking is locked (or missing), else null.
exports.bookingLockReason = async (bookingId) => {
  const [bk] = await sequelize.query(
    'SELECT status FROM bookings WHERE id = ?',
    { replacements: [bookingId], type: sequelize.QueryTypes.SELECT }
  );
  if (!bk) return 'Booking not found.';
  if (bk.status === 'cancelled')
    return 'This booking was cancelled and can no longer be modified.';
  return null;
};
