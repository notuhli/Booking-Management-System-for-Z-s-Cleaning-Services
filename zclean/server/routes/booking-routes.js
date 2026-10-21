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
// The other half of verifying: turning a receipt down, with a reason.
r.patch('/:id/reject-gcash', authenticate, requireRole('admin'), c.rejectGcash);
// Ending the loop when the receipts keep failing. Only applies to a booking
// whose receipt was rejected — general cancellation stays removed.
r.patch('/:id/cancel-rejected', authenticate, requireRole('admin'), c.cancelRejectedBooking);
// The client's way back after a rejection — same upload pipeline (size limit,
// magic-byte check, storage) that a new booking's receipt goes through.
//
// Rate limited separately from booking creation: without this, someone whose
// receipt was refused could push image after image at the server, filling
// storage and the admin's queue. Five an hour is far more than a real client
// needs to send one corrected receipt.
const reuploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many receipt uploads. Please wait a while, or message us in the app.' },
  standardHeaders: true,
  legacyHeaders: false,
});
r.patch('/:id/receipt',      authenticate, requireRole('client'), reuploadLimiter,
        uploadReceipt.single('gcash_receipt'), uploadError, verifyImage, c.reuploadReceipt);
r.patch('/:id/house-size',   authenticate, requireRole('admin'), c.setHouseSize);
r.patch('/:id/reschedule',          authenticate, requireRole('admin'),  c.rescheduleBooking);
r.patch('/:id/reschedule-response', authenticate, requireRole('client'), c.respondReschedule);
module.exports = r;
