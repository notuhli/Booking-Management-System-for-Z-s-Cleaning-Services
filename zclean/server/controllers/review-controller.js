const sequelize = require('../models/db');
const { str, firstError } = require('../utils/validate');

exports.createReview = async (req, res) => {
  const { booking_id, rating, comment } = req.body;
  if (!booking_id || !rating) return res.status(400).json({ message: 'Booking and rating are required.' });
  // Validate here instead of relying only on the database CHECK, so a bad value
  // gets a clear 400 instead of a generic 500 from a constraint error.
  const badComment = firstError([str(comment, 'Comment', { max: 1000 })]);
  if (badComment) return res.status(400).json({ message: badComment });
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
  try {
    const [bk] = await sequelize.query(
      "SELECT id FROM bookings WHERE id = ? AND client_id = ? AND status IN ('done','completed')",
      { replacements: [booking_id, req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!bk) return res.status(403).json({ message: 'You can only review completed bookings.' });
    await sequelize.query(
      'INSERT INTO reviews (booking_id, client_id, rating, comment) VALUES (?,?,?,?)',
      { replacements: [booking_id, req.user.id, stars, comment || null] }
    );
    res.status(201).json({ message: 'Review submitted.' });
  } catch (e) {
    // 'Duplicate' is MySQL's wording; Postgres reports a unique violation as
    // code 23505 ("duplicate key value…"). Checking only the MySQL text meant a
    // second review on Supabase came back as a 500 instead of "Already reviewed".
    if (e.message?.includes('Duplicate') || e.original?.code === '23505')
      return res.status(409).json({ message: 'Already reviewed.' });
    res.status(500).json({ message: 'Failed to submit review.' });
  }
};

exports.listReviews = async (req, res) => {
  try {
    const reviews = await sequelize.query(`
      SELECT r.*, u.name AS client_name, b.date, s.name AS service_name
      FROM reviews r
      JOIN users    u ON u.id = r.client_id
      JOIN bookings b ON b.id = r.booking_id
      JOIN services s ON s.id = b.service_id
      ORDER BY r.created_at DESC
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(reviews);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch reviews.' }); }
};

exports.listPublicReviews = async (req, res) => {
  try {
    const reviews = await sequelize.query(`
      SELECT r.rating, r.comment, r.reply, r.created_at, u.name AS client_name, s.name AS service_name
      FROM reviews r
      JOIN users    u ON u.id = r.client_id
      JOIN bookings b ON b.id = r.booking_id
      JOIN services s ON s.id = b.service_id
      ORDER BY r.created_at DESC LIMIT 20
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(reviews);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch reviews.' }); }
};

exports.replyReview = async (req, res) => {
  const { reply } = req.body;
  const bad = firstError([str(reply, 'Reply', { required: true, max: 1000 })]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query('UPDATE reviews SET reply = ? WHERE id = ?', { replacements: [reply, req.params.id] });
    res.json({ message: 'Reply saved.' });
  } catch (e) {
    console.error('replyReview error:', e.message);
    // The database's own words are logged, never returned: they name tables,
    // columns and constraints, which is a free map of the schema for anyone
    // probing the API.
    res.status(500).json({ message: 'Failed to save the reply.' });
  }
};
