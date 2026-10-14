const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const sequelize = require('../models/db');

exports.register = async (req, res) => {
  const { name, email, phone, address, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  // Same check the email-change endpoint uses, so an address that would be
  // rejected when changed cannot slip in at registration.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  if (password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  try {
    const [existing] = await sequelize.query(
      'SELECT id FROM users WHERE email = ?',
      { replacements: [email.toLowerCase()], type: sequelize.QueryTypes.SELECT }
    );
    if (existing) return res.status(409).json({ message: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    await sequelize.query(
      'INSERT INTO users (name, email, phone, address, password, role) VALUES (?,?,?,?,?,?)',
      { replacements: [name.trim(), email.toLowerCase(), phone || null, address || null, hashed, 'client'] }
    );
    res.status(201).json({ message: 'Account created successfully.' });
  } catch (e) {
    console.error('register error:', e.message);
    res.status(500).json({ message: 'Registration failed.' });
  }
};

// ── checkEmail ───────────────────────────────────────────────────────────────
// Lets the registration form tell the user an address is taken while they are
// still typing, instead of after they have filled in every step. It only ever
// answers { available: true/false } — no name, no id, nothing about the account.
// register() still does its own check, so this is a convenience for the form
// and never the thing that actually protects the users table.
exports.checkEmail = async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  // Treat anything that isn't a plausible address as "nothing to report", so
  // the form stays quiet while the user is halfway through typing.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.json({ available: true });
  try {
    const [existing] = await sequelize.query(
      'SELECT id FROM users WHERE email = ?',
      { replacements: [email], type: sequelize.QueryTypes.SELECT }
    );
    res.json({ available: !existing });
  } catch (e) {
    console.error('checkEmail error:', e.message);
    // On failure say "available" so a database hiccup cannot block registration;
    // register() will still reject a duplicate on submit.
    res.json({ available: true });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' });
  try {
    const [user] = await sequelize.query(
      'SELECT * FROM users WHERE email = ?',
      { replacements: [email.toLowerCase()], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(401).json({ message: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok)  return res.status(401).json({ message: 'Invalid email or password.' });
    // Deactivated accounts cannot sign in. Checked AFTER the password so the
    // message can't be used to discover which addresses are registered.
    if (user.is_active === false)
      return res.status(403).json({
        message: 'This account has been deactivated. Please contact us at 0916-213-3460 to reactivate it.',
      });
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role } });
  } catch (e) {
    console.error('login error:', e.message);
    res.status(500).json({ message: 'Login failed.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const [user] = await sequelize.query(
      'SELECT id, name, email, phone, address, role, created_at FROM users WHERE id = ?',
      { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch user.' });
  }
};
