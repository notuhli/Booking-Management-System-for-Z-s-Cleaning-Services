const sequelize = require('../models/db');
const { str, int, firstError } = require('../utils/validate');
const dl = require('../utils/sql-dialect');

// GET /api/messages/:other_user_id — load all messages between current user and other_user_id
exports.getMessages = async (req, res) => {
  const { other_user_id } = req.params;
  const me = req.user.id;
  try {
    const messages = await sequelize.query(`
      SELECT m.*, u.name AS sender_name, u.role AS sender_role
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `, { replacements: [me, other_user_id, other_user_id, me], type: sequelize.QueryTypes.SELECT });
    res.json(messages);
  } catch (e) {
    console.error('getMessages error:', e.message);
    res.status(500).json({ message: 'Failed to fetch messages.' });
  }
};

// POST /api/messages — send a message
exports.sendMessage = async (req, res) => {
  const { receiver_id, booking_id, message } = req.body;
  // A message needs text OR an image (an image may carry a caption, or none).
  const image_url = req.file ? `/uploads/chat/${req.file.filename}` : null;
  if (!receiver_id || (!message?.trim() && !image_url))
    return res.status(400).json({ message: 'A message or an image is required.' });
  // A chat message is a message, not a place to post 100 KB of text.
  const bad = firstError([
    int(receiver_id, 'Recipient', { required: true, min: 1, max: 999999999 }),
    str(message, 'Message', { max: 2000 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    const result = await dl.insertGetId(sequelize,
      'INSERT INTO messages (sender_id, receiver_id, booking_id, message, image_url) VALUES (?,?,?,?,?)',
      [req.user.id, receiver_id, booking_id || null, message?.trim() || '', image_url]);
    const [newMsg] = await sequelize.query(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role
       FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      { replacements: [result], type: sequelize.QueryTypes.SELECT }
    );
    res.status(201).json(newMsg);
  } catch (e) {
    console.error('sendMessage error:', e.message);
    res.status(500).json({ message: 'Failed to send message.' });
  }
};

// PATCH /api/messages/read/:other_user_id — mark all messages from other_user as read
exports.markRead = async (req, res) => {
  try {
    await sequelize.query(
      'UPDATE messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ?',
      { replacements: [req.params.other_user_id, req.user.id] }
    );
    res.json({ message: 'Marked as read.' });
  } catch (e) {
    res.status(500).json({ message: 'Failed to mark read.' });
  }
};

// GET /api/messages/unread-count — total unread for current user
exports.unreadCount = async (req, res) => {
  try {
    const [row] = await sequelize.query(
      'SELECT COUNT(*) AS cnt FROM messages WHERE receiver_id = ? AND is_read = FALSE',
      { replacements: [req.user.id] }
    );
    res.json({ count: parseInt(row[0].cnt) });
  } catch (e) {
    res.status(500).json({ count: 0 });
  }
};

// GET /api/messages/conversations — last message + unread count per contact (admin contact list preview)
exports.listConversations = async (req, res) => {
  const me = req.user.id;
  try {
    const rows = await sequelize.query(`
      SELECT
        other_id,
        (SELECT message    FROM messages m2
           WHERE (m2.sender_id = other_id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = other_id)
           ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages m2
           WHERE (m2.sender_id = other_id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = other_id)
           ORDER BY m2.created_at DESC LIMIT 1) AS last_message_at,
        -- Whether that newest message carried an image, so a photo-only
        -- message shows "Sent a photo" instead of an empty preview row.
        (SELECT image_url  FROM messages m2
           WHERE (m2.sender_id = other_id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = other_id)
           ORDER BY m2.created_at DESC LIMIT 1) AS last_image_url,
        (SELECT sender_id  FROM messages m2
           WHERE (m2.sender_id = other_id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = other_id)
           ORDER BY m2.created_at DESC LIMIT 1) AS last_sender_id,
        (SELECT COUNT(*) FROM messages m2
           WHERE m2.sender_id = other_id AND m2.receiver_id = ? AND m2.is_read = FALSE) AS unread_count
      FROM (
        SELECT DISTINCT
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
      ) AS contacts
    `, { replacements: Array(12).fill(me), type: sequelize.QueryTypes.SELECT });

    // Build a lookup keyed by other_id so the frontend can merge with the existing client list
    const lookup = {};
    rows.forEach(r => {
      lookup[r.other_id] = {
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        // Needed so a photo-only message shows "sent a photo" instead of
        // falling through to the client's email address in the preview.
        last_image_url: r.last_image_url,
        last_sender_id: r.last_sender_id,
        unread_count: parseInt(r.unread_count) || 0,
      };
    });
    res.json(lookup);
  } catch (e) {
    console.error('listConversations error:', e.message);
    res.status(500).json({});
  }
};
