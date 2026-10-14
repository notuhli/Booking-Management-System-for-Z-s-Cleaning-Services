const express = require('express');
const r = express.Router();
const c = require('../controllers/review-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
r.get( '/public',       c.listPublicReviews);
r.get( '/',             authenticate, requireRole('admin'), c.listReviews);
r.post('/',             authenticate, requireRole('client'), c.createReview);
r.patch('/:id/reply',   authenticate, requireRole('admin'), c.replyReview);
module.exports = r;
