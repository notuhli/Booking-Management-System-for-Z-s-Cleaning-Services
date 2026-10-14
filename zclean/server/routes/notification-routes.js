const express = require('express');
const r = express.Router();
const c = require('../controllers/notification-controller');
const { authenticate } = require('../middleware/auth-middleware');
r.get( '/',          authenticate, c.getMyNotifications);
r.patch('/read-all', authenticate, c.markAllRead);
r.patch('/:id/read', authenticate, c.markRead);
module.exports = r;
