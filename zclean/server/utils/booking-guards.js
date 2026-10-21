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
// ── Which bookings actually hold a slot ──────────────────────────────────────
// The business takes two services a day, so this condition IS the conflict
// rule. It used to be status IN ('pending','confirmed') alone, which meant a
// booking whose GCash receipt had been REJECTED went on holding its slot
// forever: the booking stays 'pending' after a rejection, and the admin has no
// cancel action, so two bogus receipts on one date could block that date
// permanently with no money received.
//
// A payment nobody could verify does not reserve a day. Excluding rejected
// bookings releases the slot the moment the receipt is refused, and the client
// reclaims it by uploading a good one — at which point verifyGcash re-checks
// that the date still has room, because it may have been taken meanwhile.
//
// Used by every capacity check and by the calendar the client books against,
// so the two can never disagree about whether a date is full.
exports.HOLDS_SLOT = "status IN ('pending','confirmed') AND payment_status <> 'rejected'";

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
