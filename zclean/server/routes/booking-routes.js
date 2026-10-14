const express = require('express');
const r = express.Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/booking-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
const { uploadReceipt, verifyImage, uploadError } = require('../utils/upload');

// Booking creation is tighter than the global limit: every booking uploads a
// receipt image and takes a slot out of a two-per-day calendar, so a script
// firing them off could fill the schedule and the upload folder at once. Six
// an hour is far more than a real client makes.
const createBookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  message: { message: 'Too many booking attempts. Please try again later or contact us directly.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// Walk-in / phone booking, created by the admin on a caller's behalf
r.post('/admin', authenticate, requireRole('admin'), c.adminCreateBooking);
r.post('/',                  authenticate, requireRole('client'), createBookingLimiter, uploadReceipt.single('gcash_receipt'), uploadError, verifyImage, c.createBooking);
r.get( '/',                  authenticate, requireRole('admin'), c.getAllBookings);
r.get( '/my',                authenticate, requireRole('client'), c.getMyBookings);
r.patch('/:id/status',       authenticate, requireRole('admin'), c.updateBookingStatus);
r.patch('/:id/verify-gcash', authenticate, requireRole('admin'), c.verifyGcash);
r.patch('/:id/house-size',   authenticate, requireRole('admin'), c.setHouseSize);
r.patch('/:id/reschedule',          authenticate, requireRole('admin'),  c.rescheduleBooking);
r.patch('/:id/reschedule-response', authenticate, requireRole('client'), c.respondReschedule);
module.exports = r;
