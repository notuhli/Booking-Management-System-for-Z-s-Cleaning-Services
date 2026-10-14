const express = require('express');
const r = express.Router();
const { listClients, getClientBookings, setClientStatus, deleteClient } = require('../controllers/client-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
r.get('/', authenticate, requireRole('admin'), listClients);
r.get(   '/:id/bookings', authenticate, requireRole('admin'), getClientBookings);
r.patch( '/:id/status',   authenticate, requireRole('admin'), setClientStatus);
r.delete('/:id',          authenticate, requireRole('admin'), deleteClient);
module.exports = r;
