const sequelize = require('../models/db');
const dl = require('../utils/sql-dialect');
const { str, money, int, firstError } = require('../utils/validate');

exports.getSettings = async (req, res) => {
  try {
    const rows = await sequelize.query('SELECT setting_key, setting_value FROM settings', { type: sequelize.QueryTypes.SELECT });
    const obj = {};
    rows.forEach(r => { obj[r.setting_key] = r.setting_value; });
    res.json(obj);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch settings.' }); }
};

exports.updateSettings = async (req, res) => {
  // surcharge_pct_* are the percentages of the service price used for larger
  // houses. The older surcharge_* (flat peso) keys are still accepted so any
  // saved values stay readable, but nothing calculates from them any more.
  const {
    gcash_name, gcash_number, transport_fee, surcharge_100_200, surcharge_200_plus,
    surcharge_pct_100_200, surcharge_pct_200_plus, reservation_fee,
  } = req.body;
  // Every one of these lands on the client's booking page or in a price, so
  // they are checked before they are stored.
  const bad = firstError([
    str(gcash_name,               'GCash name',          { max: 100 }),
    str(gcash_number,             'GCash number',        { max: 30 }),
    money(transport_fee,          'Transportation fee'),
    money(reservation_fee,        'Reservation'),
    int(surcharge_pct_100_200,    '100–200 sqm percent', { min: 0, max: 1000 }),
    int(surcharge_pct_200_plus,   'Above 200 sqm percent', { min: 0, max: 1000 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    const pairs = {
      gcash_name, gcash_number, transport_fee, surcharge_100_200, surcharge_200_plus,
      surcharge_pct_100_200, surcharge_pct_200_plus, reservation_fee,
    };
    for (const [key, val] of Object.entries(pairs)) {
      if (val !== undefined) {
        await sequelize.query(
          dl.isPg
            ? `INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`
            : `INSERT INTO settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?`,
          { replacements: dl.isPg ? [key, val] : [key, val, val] }
        );
      }
    }
    res.json({ message: 'Settings updated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to update settings.' }); }
};

exports.uploadGcashQr = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
  const url = `/uploads/gcash/${req.file.filename}`;
  try {
    await sequelize.query(
      dl.isPg
        ? "INSERT INTO settings (setting_key, setting_value) VALUES ('gcash_qr_url',?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value"
        : "INSERT INTO settings (setting_key, setting_value) VALUES ('gcash_qr_url',?) ON DUPLICATE KEY UPDATE setting_value=?",
      { replacements: dl.isPg ? [url] : [url, url] });
    res.json({ message: 'GCash QR updated.', url });
  } catch (e) { res.status(500).json({ message: 'Failed to upload QR.' }); }
};
