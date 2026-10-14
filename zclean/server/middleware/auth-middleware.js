const jwt       = require('jsonwebtoken');
const sequelize = require('../models/db');

// ── authenticate ─────────────────────────────────────────────────────────────
// Verifies the bearer token, then re-reads the account from the database.
//
// The signature alone is not enough. A JWT is valid for 7 days and carries a
// snapshot of the account taken at login, so on its own it would let a
// DEACTIVATED user keep full access for a week, and would keep honouring an old
// `role` after that role had been changed. Re-reading on each request means
// deactivation and role changes take effect immediately.
//
// The cost is one indexed primary-key lookup per authenticated request, which
// is the right trade for this system's traffic.
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided.' });

  let payload;
  try {
    payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  try {
    const [account] = await sequelize.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
      { replacements: [payload.id], type: sequelize.QueryTypes.SELECT }
    );

    if (!account)
      return res.status(401).json({ message: 'Account no longer exists.' });
    if (account.is_active === false)
      return res.status(403).json({ message: 'This account has been deactivated.' });

    // Role and identity come from the DATABASE, not the token, so a token
    // issued before a role change cannot be used with the old privileges.
    req.user = {
      id:    account.id,
      role:  account.role,
      name:  account.name,
      email: account.email,
    };
    next();
  } catch (e) {
    console.error('authenticate error:', e.message);
    res.status(500).json({ message: 'Could not verify your session.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: 'Forbidden.' });
  next();
};

module.exports = { authenticate, requireRole };
