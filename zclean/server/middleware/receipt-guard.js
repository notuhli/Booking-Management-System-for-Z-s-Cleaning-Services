const jwt       = require('jsonwebtoken');
const path      = require('path');
const sequelize = require('../models/db');

// ── Receipt access guard ─────────────────────────────────────────────────────
// `uploads/receipts/` holds GCash payment screenshots: reference numbers,
// amounts and the sender's name. They were served by express.static with no
// check at all, so anyone with a URL could open one — no sign-in needed.
//
// This guard sits in front of that one folder. Service photos and the GCash QR
// stay public, because they are meant to be seen by anyone browsing the site.
//
// WHY THE TOKEN COMES FROM THE QUERY STRING
//   A receipt is displayed with <img src="...">, and a browser will not attach
//   an Authorization header to an image request. There is no way to send the
//   usual bearer token. So the client appends the same JWT as `?t=`, and it is
//   verified here exactly as the header version would be.
//
//   The trade-off, stated honestly: a URL carrying a token can be copied out of
//   a browser history or a server log, and it stays valid while the token does.
//   It is a real weakness of this approach. It is still far better than what it
//   replaces — no token at all — and the alternative (fetching each image as a
//   blob) adds machinery this project does not need. Worth saying out loud if a
//   panelist asks, rather than presenting it as airtight.
const receiptGuard = async (req, res, next) => {
  // req.path here is relative to the mount point, e.g. '/receipts-abc123.jpg'
  const filename = path.basename(req.path);
  if (!filename) return res.status(404).end();

  const raw = req.query.t
    || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);
  if (!raw) return res.status(401).json({ message: 'Sign in to view this receipt.' });

  let payload;
  try {
    payload = jwt.verify(raw, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }

  try {
    // Who the requester is, read from the database rather than the token, so a
    // deactivated account or a changed role takes effect immediately — the same
    // rule the REST middleware follows.
    const [account] = await sequelize.query(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      { replacements: [payload.id], type: sequelize.QueryTypes.SELECT }
    );
    if (!account || account.is_active === false)
      return res.status(403).json({ message: 'This account cannot view receipts.' });

    // The admin sees every receipt — verifying payments is her job.
    if (account.role === 'admin') return next();

    // A client sees only the receipt attached to their own booking.
    const [booking] = await sequelize.query(
      'SELECT client_id FROM bookings WHERE gcash_receipt = ?',
      { replacements: [`/uploads/receipts/${filename}`], type: sequelize.QueryTypes.SELECT }
    );
    if (!booking) return res.status(404).end();
    if (booking.client_id !== account.id)
      return res.status(403).json({ message: 'This receipt belongs to another booking.' });

    next();
  } catch (e) {
    console.error('receiptGuard error:', e.message);
    res.status(500).json({ message: 'Could not check access to this receipt.' });
  }
};

module.exports = { receiptGuard };
