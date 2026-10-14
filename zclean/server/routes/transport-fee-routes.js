const express = require('express');
const r       = express.Router();
const { listFees, saveMunicipality } = require('../controllers/transport-fee-controller');
const { authenticate, requireRole }  = require('../middleware/auth-middleware');

// Public read, admin-only write — same shape as /api/services and /api/settings.
r.get('/', listFees);
r.put('/:municipality', authenticate, requireRole('admin'), saveMunicipality);

module.exports = r;
