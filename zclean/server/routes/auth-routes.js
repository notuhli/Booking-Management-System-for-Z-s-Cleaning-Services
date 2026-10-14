const express   = require('express');
const r         = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, getMe, checkEmail }        = require('../controllers/auth-controller');
const { forgotPassword, verifyOtp, resetPassword }  = require('../controllers/password-reset-controller');
const { authenticate }                              = require('../middleware/auth-middleware');

// Max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Max 5 OTP requests per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many OTP requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// Account creation is limited so the users table cannot be filled by a script.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many accounts created from this address. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// The live "is this email taken?" check the registration form calls. Limited
// because it answers one yes/no about an address; 60 per 15 minutes is far more
// than a person filling in a form needs, and far less than a useful sweep.
const checkEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { available: true },
  standardHeaders: true,
  legacyHeaders: false,
});

r.get( '/check-email',     checkEmailLimiter, checkEmail);
r.post('/register',        registerLimiter, register);
r.post('/login',           loginLimiter, login);
r.get( '/me',              authenticate, getMe);
r.get( '/admin-id',        authenticate, async (req, res) => {
  // Returns the admin user's ID so a signed-in client can address a message to
  // the right person. Now behind `authenticate`: it was public, so anyone could
  // ask the API which account is the administrator — the one id worth knowing
  // before attacking anything else. Only the chat uses it, and the chat is only
  // reachable once signed in, so nothing in the app changes.
  const sequelize = require('../models/db');
  try {
    const [admin] = await sequelize.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
      { type: sequelize.QueryTypes.SELECT }
    );
    res.json({ admin_id: admin ? admin.id : null });
  } catch (e) { res.status(500).json({ admin_id: null }); }
});
r.post('/forgot-password', otpLimiter, forgotPassword);
r.post('/verify-otp',      otpLimiter, verifyOtp);
r.post('/reset-password',  otpLimiter, resetPassword);
module.exports = r;
