const sequelize = require('../models/db');

// ── resolveTransportFee ──────────────────────────────────────────────────────
// Works out the transportation fee for a booking from the address, reading the
// admin's own figures out of `transport_fees`.
//
// It is called on the SERVER instead of trusting the amount the browser sends,
// because that amount goes straight into the client's total. A crafted request
// could otherwise book a far barangay with a ₱0 transport fee.
//
// Addresses are stored as "Municipality, Barangay, Purok" by AddressSelector.
// A typed-in address that doesn't match that shape resolves to ₱0 — the same
// as before this table existed — and the admin can adjust the booking.
async function resolveTransportFee(location) {
  const parts = String(location || '').split(',').map(p => p.trim());
  const municipality = parts[0] || '';
  const barangay     = parts[1] || '';
  if (!municipality) return 0;

  try {
    // Both candidate rows in one query; the exact barangay wins over the
    // municipality default.
    const rows = await sequelize.query(
      "SELECT barangay, fee FROM transport_fees WHERE municipality = ? AND (barangay = ? OR barangay = '')",
      { replacements: [municipality, barangay], type: sequelize.QueryTypes.SELECT }
    );
    const override = rows.find(r => r.barangay && r.barangay === barangay);
    const fallback = rows.find(r => !r.barangay);
    const chosen   = override || fallback;
    return chosen ? parseFloat(chosen.fee) || 0 : 0;
  } catch (e) {
    console.error('resolveTransportFee error:', e.message);
    return 0;
  }
}

module.exports = { resolveTransportFee };
