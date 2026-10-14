const bcrypt    = require('bcryptjs');
const sequelize = require('../models/db');
const crypto    = require('crypto');
const { sendOtpEmail } = require('../utils/mailer');

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const [user] = await sequelize.query(
      'SELECT id, name, email FROM users WHERE email = ?',
      { replacements: [email.toLowerCase().trim()], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) {
      // Don't reveal if email exists — but still return success
      return res.json({ message: 'If that email exists, an OTP has been sent.' });
    }

    const otp       = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await sequelize.query('DELETE FROM password_reset_tokens WHERE user_id = ?', { replacements: [user.id] });
    await sequelize.query(
      'INSERT INTO password_reset_tokens (user_id, otp, expires_at) VALUES (?,?,?)',
      { replacements: [user.id, otp, expiresAt] }
    );

    try {
      await sendOtpEmail({ to: user.email, name: user.name, otp });
      return res.json({ message: 'OTP sent to your email address.' });
    } catch (emailErr) {
      if (emailErr.message === 'SMTP_NOT_CONFIGURED') {
        // The code may ONLY leave the server in a response while developing.
        // Gating this on the email error alone meant a production box with
        // expired SMTP credentials would return the reset code to the caller.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[dev] SMTP not configured — OTP for ${user.email}: ${otp}`);
          return res.json({
            message: 'Email not configured. Use this code (visible in server console too):',
            dev_otp: otp,
            dev_mode: true,
          });
        }
        console.error('SMTP is not configured — password reset email could not be sent.');
        return res.status(500).json({ message: 'Could not send the reset email. Please contact us at 0916-213-3460.' });
      }
      // Real email error (wrong credentials, network, etc.). The underlying
      // message is logged, never returned — it describes server internals.
      console.error('Email send failed:', emailErr.message);
      return res.status(500).json({
        message: 'Could not send the reset email. Please try again later.',
      });
    }
  } catch (e) {
    console.error('forgotPassword error:', e.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });
  try {
    const [user] = await sequelize.query(
      'SELECT id FROM users WHERE email = ?',
      { replacements: [email.toLowerCase()], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(400).json({ message: 'Invalid code.' });

    const [token] = await sequelize.query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = ? AND otp = ? AND used = FALSE AND expires_at > NOW()`,
      { replacements: [user.id, otp.trim()], type: sequelize.QueryTypes.SELECT }
    );
    if (!token) return res.status(400).json({ message: 'Invalid or expired code. Please request a new one.' });

    res.json({ message: 'Code verified.', valid: true });
  } catch (e) {
    console.error('verifyOtp error:', e.message);
    res.status(500).json({ message: 'Verification failed.' });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, new_password } = req.body;
  if (!email || !otp || !new_password)
    return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
  if (new_password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  try {
    const [user] = await sequelize.query(
      'SELECT id FROM users WHERE email = ?',
      { replacements: [email.toLowerCase()], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(400).json({ message: 'Invalid request.' });

    const [token] = await sequelize.query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = ? AND otp = ? AND used = FALSE AND expires_at > NOW()`,
      { replacements: [user.id, otp.trim()], type: sequelize.QueryTypes.SELECT }
    );
    if (!token) return res.status(400).json({ message: 'Invalid or expired code. Please request a new one.' });

    const hashed = await bcrypt.hash(new_password, 10);
    await sequelize.query('UPDATE users SET password = ? WHERE id = ?', { replacements: [hashed, user.id] });
    await sequelize.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = ?', { replacements: [token.id] });

    res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (e) {
    console.error('resetPassword error:', e.message);
    res.status(500).json({ message: 'Reset failed. Please try again.' });
  }
};
