const sequelize = require('../models/db');
const { str, money, date, firstError } = require('../utils/validate');


// Today in Philippine time as 'YYYY-MM-DD'. The process clock is pinned to
// Asia/Manila in index.js, and 'en-CA' formats as YYYY-MM-DD, so this matches
// the date the admin sees in the form.
const today = () => new Date().toLocaleDateString('en-CA');

exports.createExpense = async (req, res) => {
  const { category, amount, description, expense_date } = req.body;
  // Checked on the server as well as in the form: the form can be bypassed.
  const bad = firstError([
    str(category,      'Category',    { required: true, max: 100 }),
    money(amount,      'Amount',      { required: true }),
    date(expense_date, 'Date',        { required: true }),
    str(description,   'Description', { max: 255 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  // The date picker already stops at today; this is the same rule on the server,
  // so a future-dated expense cannot be saved and distort the month's totals.
  if (String(expense_date) > today())
    return res.status(400).json({ message: 'An expense cannot be dated in the future.' });
  try {
    await sequelize.query(
      'INSERT INTO expenses (category, amount, description, expense_date, recorded_by) VALUES (?,?,?,?,?)',
      { replacements: [category, amount, description || null, expense_date, req.user.id] }
    );
    res.status(201).json({ message: 'Expense recorded.' });
  } catch (e) { res.status(500).json({ message: 'Failed to record expense.' }); }
};

exports.getExpenses = async (req, res) => {
  let { month, year } = req.query;
  if (month) month = parseInt(month);
  if (year)  year  = parseInt(year); // PG: EXTRACT() is numeric
  let where = '';
  const replacements = [];
  if (month && year) {
    where = 'WHERE EXTRACT(MONTH FROM expense_date) = ? AND EXTRACT(YEAR FROM expense_date) = ?';
    replacements.push(month, year);
  }
  try {
    const expenses = await sequelize.query(
      `SELECT e.*, u.name AS recorded_by_name FROM expenses e LEFT JOIN users u ON u.id = e.recorded_by ${where} ORDER BY expense_date DESC`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );
    res.json(expenses);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch expenses.' }); }
};

exports.updateExpense = async (req, res) => {
  const { category, amount, description, expense_date } = req.body;
  const bad = firstError([
    str(category,      'Category',    { required: true, max: 100 }),
    money(amount,      'Amount',      { required: true }),
    date(expense_date, 'Date',        { required: true }),
    str(description,   'Description', { max: 255 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  if (expense_date && String(expense_date) > today())
    return res.status(400).json({ message: 'An expense cannot be dated in the future.' });
  try {
    await sequelize.query(
      'UPDATE expenses SET category=?, amount=?, description=?, expense_date=? WHERE id=?',
      { replacements: [category, amount, description || null, expense_date, req.params.id] }
    );
    res.json({ message: 'Expense updated.' });
  } catch (e) { res.status(500).json({ message: 'Failed to update expense.' }); }
};

exports.deleteExpense = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM expenses WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Expense deleted.' });
  } catch (e) { res.status(500).json({ message: 'Failed to delete expense.' }); }
};
