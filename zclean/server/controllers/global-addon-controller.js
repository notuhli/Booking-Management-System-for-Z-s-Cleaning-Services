const sequelize = require('../models/db');
const { str, money, firstError } = require('../utils/validate');

exports.listAddons = async (req, res) => {
  try {
    const addons = await sequelize.query(
      'SELECT * FROM global_addons WHERE is_active = TRUE ORDER BY id ASC',
      { type: sequelize.QueryTypes.SELECT }
    );
    res.json(addons);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch add-ons.' }); }
};

exports.listAll = async (req, res) => {
  try {
    const addons = await sequelize.query('SELECT * FROM global_addons ORDER BY id ASC', { type: sequelize.QueryTypes.SELECT });
    res.json(addons);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch add-ons.' }); }
};

exports.createAddon = async (req, res) => {
  const { name, price } = req.body;
  const bad = firstError([
    str(name,    'Add-on name', { required: true, max: 100 }),
    money(price, 'Price'),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query('INSERT INTO global_addons (name, price) VALUES (?,?)', { replacements: [name, price || 0] });
    res.status(201).json({ message: 'Add-on created.' });
  } catch (e) { res.status(500).json({ message: 'Failed to create add-on.' }); }
};

exports.updateAddon = async (req, res) => {
  const { name, price, is_active } = req.body;
  const bad = firstError([
    str(name,    'Add-on name', { required: true, max: 100 }),
    money(price, 'Price'),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query(
      'UPDATE global_addons SET name=?, price=?, is_active=? WHERE id=?',
      { replacements: [name, price, is_active !== undefined ? (is_active === true || is_active === 'true' || Number(is_active) === 1) : true, req.params.id] }
    );
    res.json({ message: 'Add-on updated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to update add-on.' }); }
};

// Deactivate: hides the add-on from clients but keeps it, and keeps it on the
// bookings that already carry it. This is the safe default.
exports.deleteAddon = async (req, res) => {
  try {
    await sequelize.query('UPDATE global_addons SET is_active = FALSE WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Add-on deactivated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to deactivate add-on.' }); }
};

// ── DELETE /api/global-addons/:id/permanent ─────────────────────────────────
// Actually removes the row — but only when no booking has ever used it.
//
// WHY THE CHECK: booking_global_addons cascades from global_addons, so deleting
// an add-on that is attached to past bookings would silently delete those
// junction rows too. The booking total is computed by summing the add-ons
// joined through that table, so every affected booking's total would drop and
// past revenue figures would change. The same rule already guards services.
exports.permanentlyDeleteAddon = async (req, res) => {
  try {
    const [[{ cnt }]] = await sequelize.query(
      'SELECT COUNT(*) AS cnt FROM booking_global_addons WHERE addon_id = ?',
      { replacements: [req.params.id] }
    );
    if (parseInt(cnt) > 0) {
      return res.status(400).json({
        message: `Cannot permanently delete — this add-on is on ${cnt} booking(s). Deactivate it instead so it is hidden from clients while those bookings keep their correct totals.`
      });
    }
    await sequelize.query('DELETE FROM global_addons WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Add-on permanently deleted.' });
  } catch (e) { res.status(500).json({ message: 'Failed to permanently delete add-on.' }); }
};
