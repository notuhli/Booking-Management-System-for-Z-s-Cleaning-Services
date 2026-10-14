const express = require('express');
const r = express.Router();
const c = require('../controllers/note-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');

r.get(   '/',    authenticate, requireRole('admin'), c.listNotes);
r.post(  '/',    authenticate, requireRole('admin'), c.createNote);
r.put(   '/:id', authenticate, requireRole('admin'), c.updateNote);
r.delete('/:id', authenticate, requireRole('admin'), c.deleteNote);

module.exports = r;
