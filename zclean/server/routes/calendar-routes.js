const express = require('express');
const r = express.Router();
const c = require('../controllers/calendar-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
r.get( '/blocked',       c.getBlockedDates);
r.get( '/booked-dates',  c.getBookedDates);
r.post('/blocked',       authenticate, requireRole('admin'), c.blockDate);
r.delete('/blocked/:id', authenticate, requireRole('admin'), c.unblockDate);
module.exports = r;
