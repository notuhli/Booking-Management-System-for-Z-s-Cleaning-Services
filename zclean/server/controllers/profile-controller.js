const bcrypt    = require('bcryptjs');
const sequelize = require('../models/db');
const { str, firstError } = require('../utils/validate');
const { sendEmailChangedNotice } = require('../utils/mailer');

exports.updateProfile = async (req, res) => {
  const { name, phone, address } = req.body;
  const bad = firstError([
    str(name,    'Name',    { required: true, max: 100 }),
    str(phone,   'Phone',   { max: 30 }),
    str(address, 'Address', { max: 255 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query(
      'UPDATE users SET name=?, phone=?, address=? WHERE id=?',
      { replacements: [name, phone || null, address || null, req.user.id] }
    );
    const [user] = await sequelize.query(
      'SELECT id, name, email, phone, address, role FROM users WHERE id=?',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    res.json({ message: 'Profile updated.', user });
  } catch (e) { res.status(500).json({ message: 'Failed to update profile.' }); }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ message: 'Both fields are required.' });
  if (new_password.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  try {
    const [user] = await sequelize.query('SELECT password FROM users WHERE id=?', { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT });
    const ok = await bcrypt.compare(current_password, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(new_password, 10);
    await sequelize.query('UPDATE users SET password=? WHERE id=?', { replacements: [hashed, req.user.id] });
    res.json({ message: 'Password changed.' });
  } catch (e) { res.status(500).json({ message: 'Failed to change password.' }); }
};

// ── PUT /api/profile/email ───────────────────────────────────────────────────
// Email is the login identity and the destination for booking confirmations
// and reminders, so changing it requires the account password — the same
// re-authentication gate used by changePassword above. This prevents someone
// on an unattended logged-in device from taking over the account by silently
// swapping the address.
exports.changeEmail = async (req, res) => {
  const { new_email, password } = req.body;
  if (!new_email || !password)
    return res.status(400).json({ message: 'New email and your password are required.' });

  const email = String(new_email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ message: 'Please enter a valid email address.' });

  try {
    const [user] = await sequelize.query(
      'SELECT email, password FROM users WHERE id=?',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    if (email === String(user.email).toLowerCase())
      return res.status(400).json({ message: 'That is already your email address.' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Password is incorrect.' });

    // Email is UNIQUE in the schema; check first so the client gets a clear
    // message instead of a raw constraint error.
    const [taken] = await sequelize.query(
      'SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?',
      { replacements: [email, req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    if (taken) return res.status(409).json({ message: 'That email is already registered to another account.' });

    await sequelize.query('UPDATE users SET email=? WHERE id=?',
      { replacements: [email, req.user.id] });

    const [updated] = await sequelize.query(
      'SELECT id, name, email, phone, address, role FROM users WHERE id=?',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );

    // Courtesy notice to the OLD address, so an unauthorised change is visible
    // to the real owner. Never blocks the request if mail fails.
    try {
      await sendEmailChangedNotice({ to: user.email, name: updated.name, newEmail: email });
    } catch (e) { console.warn('Email-change notice failed:', e.message); }

    res.json({ message: 'Email updated. Use it next time you sign in.', user: updated });
  } catch (e) {
    console.error('changeEmail error:', e.message);
    res.status(500).json({ message: 'Failed to update email.' });
  }
};

// ── POST /api/profile/deactivate — client deactivates their own account ─────
// Requires the account password, same re-authentication gate as changePassword
// and changeEmail: someone on an unattended logged-in device must not be able
// to disable the account.
//
// Blocked while upcoming bookings exist. Otherwise the business would have
// confirmed jobs scheduled for an account that can no longer sign in, be
// contacted through chat, or receive reminders — the client must settle those
// with the business first.
exports.deactivateAccount = async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Your password is required.' });
  try {
    const [user] = await sequelize.query(
      'SELECT password FROM users WHERE id = ?',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(404).json({ message: 'Account not found.' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Password is incorrect.' });

    const [[cnt]] = await sequelize.query(
      "SELECT COUNT(*) AS c FROM bookings WHERE client_id = ? AND status IN ('pending','confirmed','pending_reschedule')",
      { replacements: [req.user.id] }
    );
    const upcoming = parseInt(cnt.c);
    if (upcoming > 0)
      return res.status(409).json({
        message: `You have ${upcoming} upcoming booking${upcoming === 1 ? '' : 's'}. Please contact us at 0916-213-3460 to settle ${upcoming === 1 ? 'it' : 'them'} before deactivating your account.`,
      });

    await sequelize.query('UPDATE users SET is_active = FALSE WHERE id = ?',
      { replacements: [req.user.id] });

    res.json({ message: 'Your account has been deactivated. Contact us any time to reactivate it.' });
  } catch (e) {
    console.error('deactivateAccount error:', e.message);
    res.status(500).json({ message: 'Failed to deactivate your account.' });
  }
};
