const sequelize = require('../models/db');

// ── Transportation fees ──────────────────────────────────────────────────────
// One row per municipality default (barangay = '') plus one row per barangay
// that differs from it. See database/migration_v13_transport_fees.sql.

// GET /api/transport-fees — public, because the booking page has to show the
// fee before the client commits to anything. It exposes price list data only.
exports.listFees = async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT municipality, barangay, fee FROM transport_fees',
      { type: sequelize.QueryTypes.SELECT }
    );
    // Shaped for direct lookup in the UI:
    //   { defaults: { 'Gandara': 500 }, overrides: { 'Calbayog City': { 'Ubo': 500 } } }
    const defaults = {}, overrides = {};
    rows.forEach(r => {
      const fee = parseFloat(r.fee) || 0;
      if (!r.barangay) { defaults[r.municipality] = fee; return; }
      (overrides[r.municipality] ||= {})[r.barangay] = fee;
    });
    res.json({ defaults, overrides });
  } catch (e) {
    console.error('listFees error:', e.message);
    res.status(500).json({ message: 'Failed to fetch transportation fees.' });
  }
};

// PUT /api/transport-fees/:municipality — admin only.
// Body: { default_fee: number, overrides: { '<barangay>': number } }
// The municipality's rows are replaced wholesale, so a barangay left out of
// `overrides` goes back to following the municipality default.
exports.saveMunicipality = async (req, res) => {
  const municipality = String(req.params.municipality || '').trim();
  const { default_fee, overrides } = req.body;
  if (!municipality)
    return res.status(400).json({ message: 'Municipality is required.' });

  const amount = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };

  const base = amount(default_fee);
  if (base === null)
    return res.status(400).json({ message: 'The default fee must be ₱0 or more.' });

  // Validate every override BEFORE writing anything, so one bad value cannot
  // leave the municipality half-saved.
  const clean = [];
  for (const [barangay, value] of Object.entries(overrides || {})) {
    const name = String(barangay).trim();
    if (!name) continue;
    const fee = amount(value);
    if (fee === null)
      return res.status(400).json({ message: `The fee for ${name} must be ₱0 or more.` });
    clean.push([name, fee]);
  }

  const tx = await sequelize.transaction();
  try {
    await sequelize.query(
      'DELETE FROM transport_fees WHERE municipality = ?',
      { replacements: [municipality], transaction: tx }
    );
    await sequelize.query(
      "INSERT INTO transport_fees (municipality, barangay, fee) VALUES (?, '', ?)",
      { replacements: [municipality, base], transaction: tx }
    );
    for (const [name, fee] of clean) {
      await sequelize.query(
        'INSERT INTO transport_fees (municipality, barangay, fee) VALUES (?,?,?)',
        { replacements: [municipality, name, fee], transaction: tx }
      );
    }
    await tx.commit();
    res.json({ message: `Transportation fees for ${municipality} saved.` });
  } catch (e) {
    await tx.rollback();
    console.error('saveMunicipality error:', e.message);
    res.status(500).json({ message: 'Failed to save transportation fees.' });
  }
};
