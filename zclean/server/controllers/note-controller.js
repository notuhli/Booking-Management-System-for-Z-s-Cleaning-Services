const sequelize = require('../models/db');
const { str, firstError } = require('../utils/validate');
const dl = require('../utils/sql-dialect');

// Admin dashboard notes — a personal scratchpad. All routes are admin-guarded
// (see note-routes.js), so no per-user scoping is needed.

exports.listNotes = async (_req, res) => {
  try {
    const notes = await sequelize.query(
      'SELECT * FROM admin_notes ORDER BY created_at DESC',
      { type: sequelize.QueryTypes.SELECT }
    );
    res.json(notes);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch notes.' }); }
};

exports.createNote = async (req, res) => {
  const { content } = req.body;
  const bad = firstError([str(content, 'Note', { required: true, max: 2000 })]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    const id = await dl.insertGetId(sequelize,
      'INSERT INTO admin_notes (content) VALUES (?)',
      [content.trim()]);
    res.status(201).json({ id, content: content.trim() });
  } catch (e) { res.status(500).json({ message: 'Failed to add note.' }); }
};

exports.updateNote = async (req, res) => {
  const { content } = req.body;
  const bad = firstError([str(content, 'Note', { required: true, max: 2000 })]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query(
      'UPDATE admin_notes SET content = ? WHERE id = ?',
      { replacements: [content.trim(), req.params.id] }
    );
    res.json({ message: 'Note updated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to update note.' }); }
};

exports.deleteNote = async (req, res) => {
  try {
    await sequelize.query(
      'DELETE FROM admin_notes WHERE id = ?',
      { replacements: [req.params.id] }
    );
    res.json({ message: 'Note deleted.' });
  } catch (e) { res.status(500).json({ message: 'Failed to delete note.' }); }
};
