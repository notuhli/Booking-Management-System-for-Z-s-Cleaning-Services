const sequelize = require('../models/db');
const { str, date: dateCheck, firstError } = require('../utils/validate');
const dl = require('../utils/sql-dialect');

exports.getBlockedDates = async (req, res) => {
  try {
    const dates = await sequelize.query('SELECT * FROM blocked_dates ORDER BY date ASC', { type: sequelize.QueryTypes.SELECT });
    res.json(dates);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch blocked dates.' }); }
};

exports.blockDate = async (req, res) => {
  const { date, reason } = req.body;
  const bad = firstError([
    dateCheck(date, 'Date',  { required: true }),
    str(reason,     'Reason', { max: 255 }),
  ]);
  if (bad) return res.status(400).json({ message: bad });
  try {
    await sequelize.query(dl.insertIgnore('blocked_dates', 'date, reason', '?,?', 'date'), { replacements: [date, reason || null] });
    res.status(201).json({ message: 'Date blocked.' });
  } catch (e) { res.status(500).json({ message: 'Failed to block date.' }); }
};

exports.unblockDate = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM blocked_dates WHERE id = ?', { replacements: [req.params.id] });
    res.json({ message: 'Date unblocked.' });
  } catch (e) { res.status(500).json({ message: 'Failed to unblock date.' }); }
};

exports.getBookedDates = async (req, res) => {
  try {
    // Return each date with count so frontend can show partial vs fully booked
    const dates = await sequelize.query(`
      SELECT date, COUNT(*) AS cnt
      FROM bookings
      WHERE status IN ('pending','confirmed')
      GROUP BY date
      ORDER BY date ASC
    `, { type: sequelize.QueryTypes.SELECT });
    // full = 2+ bookings, partial = 1 booking
    res.json(dates.map(d => ({ date: d.date, full: parseInt(d.cnt) >= 2 })));
  } catch (e) { res.status(500).json({ message: 'Failed to fetch booked dates.' }); }
};
