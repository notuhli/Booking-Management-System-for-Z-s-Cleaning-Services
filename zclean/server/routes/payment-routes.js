const express = require('express');
const r = express.Router();
const c = require('../controllers/payment-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
r.post('/',                    authenticate, requireRole('admin'), c.recordPayment);
r.get( '/booking/:booking_id', authenticate, requireRole('admin'), c.getByBooking);
r.get( '/summary/:booking_id', authenticate, requireRole('admin'), c.getSummary);
module.exports = r;
