const express = require('express');
const r = express.Router();
const c = require('../controllers/profile-controller');
const { authenticate } = require('../middleware/auth-middleware');
r.put( '/',         authenticate, c.updateProfile);
r.post('/password', authenticate, c.changePassword);
r.put( '/email',    authenticate, c.changeEmail);
r.post('/deactivate', authenticate, c.deactivateAccount);
module.exports = r;
