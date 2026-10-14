const express = require('express');
const r = express.Router();
const c = require('../controllers/message-controller');
const { authenticate } = require('../middleware/auth-middleware');
const { uploadChatImage, verifyImage, uploadError } = require('../utils/upload');

r.get('/unread-count',          authenticate, c.unreadCount);
r.get('/conversations',         authenticate, c.listConversations);
r.get('/:other_user_id',        authenticate, c.getMessages);
// .single('image') is optional — text-only messages post the same way.
r.post('/',                     authenticate, uploadChatImage.single('image'), uploadError, verifyImage, c.sendMessage);
r.patch('/read/:other_user_id', authenticate, c.markRead);

module.exports = r;
