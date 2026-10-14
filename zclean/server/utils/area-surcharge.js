const sequelize = require('../models/db');

// ── resolveAreaSurcharge ─────────────────────────────────────────────────────
// Works out the extra charge for a larger house.
//
// It is a PERCENTAGE OF THE SERVICE PRICE, because that is what the business
// actually does: a big house roughly doubles the work, and doubling the work
// on a ₱5,000 package is not the same amount of money as doubling it on a
// ₱1,500 one. A flat ₱500 (the old rule) overcharged small packages and badly
// undercharged large ones.
//
// The percentage applies to the SERVICE PRICE ONLY. Add-ons are priced
// separately for what they are, and the transportation fee depends on distance,
// not on the size of the house — neither is multiplied.
//
// Calculated on the server rather than taken from the request, for the same
// reason as the transportation fee: the amount goes straight into the client's
// total, so it must come from the admin's own settings.

const DEFAULT_PCT = { '100_200': 100, '200_plus': 150 };

async function resolveAreaSurcharge(sqmRange, servicePrice) {
  const range = String(sqmRange || 'under_100');
  if (range !== '100_200' && range !== '200_plus') return 0;

  const price = parseFloat(servicePrice) || 0;
  if (price <= 0) return 0;

  const key = range === '100_200' ? 'surcharge_pct_100_200' : 'surcharge_pct_200_plus';
  let pct = DEFAULT_PCT[range];
  try {
    const [row] = await sequelize.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      { replacements: [key], type: sequelize.QueryTypes.SELECT }
    );
    const saved = parseFloat(row?.setting_value);
    if (Number.isFinite(saved) && saved >= 0) pct = saved;
  } catch (e) {
    console.error('resolveAreaSurcharge error:', e.message);
  }
  // Rounded to centavos so the stored figure matches what was shown.
  return Math.round(price * (pct / 100) * 100) / 100;
}

module.exports = { resolveAreaSurcharge, DEFAULT_PCT };
