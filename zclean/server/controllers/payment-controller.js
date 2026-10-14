const sequelize = require('../models/db');
const { bookingLockReason } = require('../utils/booking-guards');
const { syncPaymentStatus, getPaymentSummary } = require('../utils/payment-status');

exports.recordPayment = async (req, res) => {
  const { booking_id, amount, method } = req.body;
  if (!booking_id || !amount) return res.status(400).json({ message: 'Booking and amount required.' });
  const paid = parseFloat(amount);
  if (!Number.isFinite(paid) || paid <= 0)
    return res.status(400).json({ message: 'Payment amount must be more than ₱0.' });
  try {
    // A cancelled booking can't take payment — no service will be rendered.
    const locked = await bookingLockReason(booking_id);
    if (locked) return res.status(409).json({ message: locked });
    await sequelize.query(
      "INSERT INTO payments (booking_id, amount, method) VALUES (?,?,?)",
      { replacements: [booking_id, paid, method || 'Cash'] }
    );
    // ── Status is DERIVED from money received, never set by hand ──────────
    //   unpaid / partial / paid  — by comparing payments against the total
    //   done      = performed (payment may still be owed)
    //   completed = performed AND fully paid
    // A ₱500 reservation therefore leaves the booking 'partial', not 'paid'.
    const summary = await syncPaymentStatus(booking_id);
    // null means the booking could not be read back — never claim it is paid.
    if (!summary)
      return res.status(500).json({ message: 'Payment recorded, but the balance could not be recalculated.' });
    res.status(201).json({
      message: summary.balance > 0
        ? `Payment recorded. Balance: ₱${summary.balance.toLocaleString()}.`
        : 'Payment recorded. Fully paid.',
      ...summary,
    });
  } catch (e) {
    console.error('recordPayment error:', e.message);
    res.status(500).json({ message: 'Failed to record payment.' });
  }
};

// GET /api/payments/summary/:booking_id — total, paid and balance for one
// booking, so the admin screen never has to add payments up itself.
exports.getSummary = async (req, res) => {
  try {
    const summary = await getPaymentSummary(req.params.booking_id);
    if (!summary) return res.status(404).json({ message: 'Booking not found.' });
    res.json(summary);
  } catch (e) {
    console.error('getSummary error:', e.message);
    res.status(500).json({ message: 'Failed to fetch payment summary.' });
  }
};

exports.getByBooking = async (req, res) => {
  try {
    const payments = await sequelize.query(
      'SELECT * FROM payments WHERE booking_id = ? ORDER BY paid_at DESC',
      { replacements: [req.params.booking_id], type: sequelize.QueryTypes.SELECT }
    );
    res.json(payments);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch payments.' }); }
};
