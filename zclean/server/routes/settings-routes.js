const express = require('express');
const r = express.Router();
const c = require('../controllers/settings-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
const { uploadGcashQr, verifyImage, uploadError } = require('../utils/upload');
r.get( '/',         c.getSettings);
r.put( '/',         authenticate, requireRole('admin'), c.updateSettings);
r.post('/gcash-qr', authenticate, requireRole('admin'), uploadGcashQr.single('qr_image'), uploadError, verifyImage, c.uploadGcashQr);
module.exports = r;
