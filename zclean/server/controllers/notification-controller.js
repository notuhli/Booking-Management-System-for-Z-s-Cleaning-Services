const sequelize = require('../models/db');

exports.getMyNotifications = async (req, res) => {
  try {
    const notifs = await sequelize.query(
      'SELECT * FROM client_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    res.json(notifs);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch notifications.' }); }
};

exports.markRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE client_notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', { replacements: [req.params.id, req.user.id] });
    res.json({ message: 'Marked as read.' });
  } catch (e) { res.status(500).json({ message: 'Failed.' }); }
};

exports.markAllRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE client_notifications SET is_read = TRUE WHERE user_id = ?', { replacements: [req.user.id] });
    res.json({ message: 'All marked as read.' });
  } catch (e) { res.status(500).json({ message: 'Failed.' }); }
};
