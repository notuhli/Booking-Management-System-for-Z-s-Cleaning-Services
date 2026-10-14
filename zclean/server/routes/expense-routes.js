const express = require('express');
const r = express.Router();
const c = require('../controllers/expense-controller');
const { authenticate, requireRole } = require('../middleware/auth-middleware');
r.get( '/',    authenticate, requireRole('admin'), c.getExpenses);
r.post('/',    authenticate, requireRole('admin'), c.createExpense);
r.put( '/:id', authenticate, requireRole('admin'), c.updateExpense);
r.delete('/:id',authenticate, requireRole('admin'), c.deleteExpense);
module.exports = r;
