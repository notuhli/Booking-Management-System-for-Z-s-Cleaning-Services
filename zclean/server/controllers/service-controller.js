const sequelize = require('../models/db');
const { str, money, int, firstError } = require('../utils/validate');

exports.listServices = async (req, res) => {
  try {
    const services = await sequelize.query(
      'SELECT * FROM services WHERE is_active = TRUE ORDER BY price ASC',
      { type: sequelize.QueryTypes.SELECT }
    );
    res.json(services);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch services.' }); }
};

exports.getAllServices = async (req, res) => {
  try {
    const services = await sequelize.query('SELECT * FROM services ORDER BY id ASC', { type: sequelize.QueryTypes.SELECT });
    res.json(services);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch services.' }); }
};

exports.createService = async (req, res) => {
  const { name, description, details, price, duration_hrs } = req.body;
  const bad = firstError([
    str(name,          'Service name', { required: true, max: 100 }),
    money(price,       'Price',        { required: true }),
    int(duration_hrs,  'Duration',     { min: 1, max: 24 }),
    str(description,   'Description',  { max: 500 }),
    str(details,       'Details',      { max: 2000 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  const image_url = req.file ? `/uploads/services/${req.file.filename}` : null;
  try {
    await sequelize.query(
      'INSERT INTO services (name, description, details, price, duration_hrs, image_url) VALUES (?,?,?,?,?,?)',
      { replacements: [name, description || null, details || null, price, duration_hrs || 3, image_url] }
    );
    res.status(201).json({ message: 'Service created.' });
  } catch (e) { res.status(500).json({ message: 'Failed to create service.' }); }
};

exports.updateService = async (req, res) => {
  const { name, description, details, price, duration_hrs, is_active } = req.body;
  const bad = firstError([
    str(name,          'Service name', { required: true, max: 100 }),
    money(price,       'Price',        { required: true }),
    int(duration_hrs,  'Duration',     { min: 1, max: 24 }),
    str(description,   'Description',  { max: 500 }),
    str(details,       'Details',      { max: 2000 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  const image_url = req.file ? `/uploads/services/${req.file.filename}` : undefined;
  try {
    const sets = ['name=?','description=?','details=?','price=?','duration_hrs=?','is_active=?'];
    // PG BOOLEAN rejects integer 1/0 — coerce whatever the client sent to a real boolean
    const activeBool = is_active !== undefined ? (is_active === true || is_active === 'true' || Number(is_active) === 1) : true;
    const vals = [name, description || null, details || null, price, duration_hrs || 3, activeBool];
    if (image_url !== undefined) { sets.push('image_url=?'); vals.push(image_url); }
    vals.push(req.params.id);
    await sequelize.query(`UPDATE services SET ${sets.join(',')} WHERE id=?`, { replacements: vals });
    res.json({ message: 'Service updated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to update service.' }); }
};

exports.deleteService = async (req, res) => {
  try {
    await sequelize.query('UPDATE services SET is_active = FALSE WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Service deactivated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to delete service.' }); }
};

exports.reactivateService = async (req, res) => {
  try {
    await sequelize.query('UPDATE services SET is_active = TRUE WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Service reactivated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to reactivate service.' }); }
};

// Permanently removes a service row — only allowed if it has zero bookings
// tied to it, to protect historical booking/financial records from breaking.
exports.permanentlyDeleteService = async (req, res) => {
  try {
    const [[{ cnt }]] = await sequelize.query(
      'SELECT COUNT(*) AS cnt FROM bookings WHERE service_id = ?',
      { replacements: [req.params.id] }
    );
    if (parseInt(cnt) > 0) {
      return res.status(400).json({
        message: `Cannot permanently delete — this service has ${cnt} booking(s) on record. Deactivate it instead to hide it from clients while keeping booking history intact.`
      });
    }
    await sequelize.query('DELETE FROM services WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Service permanently deleted.' });
  } catch (e) { res.status(500).json({ message: 'Failed to permanently delete service.' }); }
};
