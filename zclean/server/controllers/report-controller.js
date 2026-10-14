const sequelize = require('../models/db');
const dl = require('../utils/sql-dialect');

// ── GET /api/reports/dashboard ──────────────────────────────────────────────
// These seven queries used to run one after another, each awaiting the one
// before it. None of them depends on another's result, so the page waited for
// seven round trips to the database in a row. They now run together with
// Promise.all — one round trip's worth of waiting instead of seven.
// The SQL itself is unchanged, and so is the response.
const getDashboard = async (req, res) => {
  try {
    const qStats = sequelize.query(`
      SELECT
      -- 'cancelled' is an EXIT from the booking flow, not a stage in it, so it
      -- is excluded from total_bookings (which must reconcile with the
      -- pending/confirmed/done breakdown shown beside it) and reported as its
      -- own figure instead. Demand, fulfilment and attrition stay separate.
        COUNT(CASE WHEN status <> 'cancelled' THEN 1 END)                            AS total_bookings,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)                        AS cancelled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)                          AS pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)                        AS confirmed,
        -- done and completed are now distinct: 'done' means the service was
        -- performed but payment is still outstanding (receivables), while
        -- 'completed' means performed AND paid.
        SUM(CASE WHEN status = 'done'      THEN 1 ELSE 0 END)                        AS done,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)                        AS completed
      FROM bookings
    `);
    const qRevenue = sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total_revenue FROM payments
    `);
    const qExpenses = sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total_expenses FROM expenses
    `);
    const qClients = sequelize.query(`
      SELECT COUNT(*) AS total_clients FROM users WHERE role = 'client'
    `);

    // Monthly revenue (last 6 months)
    const qMonthly = sequelize.query(`
      SELECT ${dl.mLabel('paid_at')} AS month,
             EXTRACT(YEAR FROM paid_at) AS yr, EXTRACT(MONTH FROM paid_at) AS mo,
             SUM(amount) AS revenue
      FROM payments
      WHERE paid_at >= ${dl.subMonths(6)}
      GROUP BY month, yr, mo
      ORDER BY yr ASC, mo ASC
    `, { type: sequelize.QueryTypes.SELECT });

    // Today's bookings
    const qToday = sequelize.query(`
      SELECT b.*, u.name AS client_name, s.name AS service_name
      FROM bookings b
      JOIN users    u ON u.id = b.client_id
      JOIN services s ON s.id = b.service_id
      WHERE b.date = CURRENT_DATE AND b.status IN ('pending','confirmed')
      ORDER BY b.time_start ASC
    `, { type: sequelize.QueryTypes.SELECT });

    // Upcoming bookings
    const qUpcoming = sequelize.query(`
      SELECT b.*, u.name AS client_name, s.name AS service_name
      FROM bookings b
      JOIN users    u ON u.id = b.client_id
      JOIN services s ON s.id = b.service_id
      WHERE b.date >= CURRENT_DATE AND b.status IN ('pending','confirmed')
      ORDER BY b.date ASC, b.time_start ASC
      LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });

    // All seven go to the database together.
    const [sRaw, rRaw, eRaw, cRaw, monthly, todayBookings, upcoming] =
      await Promise.all([qStats, qRevenue, qExpenses, qClients,
                         qMonthly, qToday, qUpcoming]);
    const [[stats]]    = sRaw;
    const [[revenue]]  = rRaw;
    const [[expenses]] = eRaw;
    const [[clients]]  = cRaw;

    res.json({
      ...stats,
      total_revenue:  parseFloat(revenue.total_revenue),
      total_expenses: parseFloat(expenses.total_expenses),
      total_clients:  clients.total_clients,
      net:            parseFloat(revenue.total_revenue) - parseFloat(expenses.total_expenses),
      monthly_revenue: monthly,
      today_bookings:  todayBookings,
      upcoming_bookings: upcoming,
    });
  } catch (e) {
    console.error('getDashboard error:', e.message);
    res.status(500).json({ message: 'Failed to fetch dashboard.' });
  }
};

const getMonthlyReport = async (req, res) => {
  let { month, year } = req.query;
  month = parseInt(month); year = parseInt(year); // PG: EXTRACT() is numeric — params must be numbers
  if (!month || !year) return res.status(400).json({ message: 'Month and year are required.' });
  try {
    const [[earnings]] = await sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM payments
      WHERE EXTRACT(MONTH FROM paid_at) = ? AND EXTRACT(YEAR FROM paid_at) = ?
    `, { replacements: [month, year] });

    // Previous month (for trend comparison) — handles January wrap to previous year
    const prevMonth = month == 1 ? 12 : parseInt(month) - 1;
    const prevYear  = month == 1 ? parseInt(year) - 1 : parseInt(year);
    const [[prevEarnings]] = await sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM payments
      WHERE EXTRACT(MONTH FROM paid_at) = ? AND EXTRACT(YEAR FROM paid_at) = ?
    `, { replacements: [prevMonth, prevYear] });
    const [[prevExpTotal]] = await sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM expenses
      WHERE EXTRACT(MONTH FROM expense_date) = ? AND EXTRACT(YEAR FROM expense_date) = ?
    `, { replacements: [prevMonth, prevYear] });

    const [[expTotal]] = await sequelize.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM expenses
      WHERE EXTRACT(MONTH FROM expense_date) = ? AND EXTRACT(YEAR FROM expense_date) = ?
    `, { replacements: [month, year] });

    const bookings = await sequelize.query(`
      -- paid_amount is SUMMED in a subquery, not joined.
      -- Joining payments row-by-row duplicated the booking once per payment,
      -- and since a booking normally has two (the reservation, then the
      -- balance), every settled booking appeared twice in this listing with
      -- half its money on each line.
      SELECT b.*, u.name AS client_name, s.name AS service_name,
             (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
               WHERE p.booking_id = b.id) AS paid_amount
      FROM bookings b
      JOIN users    u ON u.id = b.client_id
      JOIN services s ON s.id = b.service_id
      WHERE EXTRACT(MONTH FROM b.date) = ? AND EXTRACT(YEAR FROM b.date) = ?
      ORDER BY b.date ASC
    `, { replacements: [month, year], type: sequelize.QueryTypes.SELECT });

    const expenses = await sequelize.query(`
      SELECT * FROM expenses
      WHERE EXTRACT(MONTH FROM expense_date) = ? AND EXTRACT(YEAR FROM expense_date) = ?
      ORDER BY expense_date ASC
    `, { replacements: [month, year], type: sequelize.QueryTypes.SELECT });

    const expByCategory = await sequelize.query(`
      SELECT category, SUM(amount) AS total
      FROM expenses
      WHERE EXTRACT(MONTH FROM expense_date) = ? AND EXTRACT(YEAR FROM expense_date) = ?
      GROUP BY category ORDER BY total DESC
    `, { replacements: [month, year], type: sequelize.QueryTypes.SELECT });

    // Count booking statuses for the month
    const [[bkStats]] = await sequelize.query(`
      SELECT
      -- 'cancelled' is an EXIT from the booking flow, not a stage in it, so it
      -- is excluded from total_bookings (which must reconcile with the
      -- pending/confirmed/done breakdown shown beside it) and reported as its
      -- own figure instead. Demand, fulfilment and attrition stay separate.
        COUNT(CASE WHEN status <> 'cancelled' THEN 1 END)                 AS total_bookings,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)              AS cancelled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)                AS pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)              AS confirmed,
        SUM(CASE WHEN status IN ('done','completed') THEN 1 ELSE 0 END)    AS done_count
      FROM bookings
      WHERE EXTRACT(MONTH FROM date) = ? AND EXTRACT(YEAR FROM date) = ?
    `, { replacements: [month, year] });

    // Trend % helper — null if no previous data to compare (avoids divide-by-zero)
    const trendPct = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

    res.json({
      gross_revenue:  parseFloat(earnings.total),
      total_expenses: parseFloat(expTotal.total),
      net_income:     parseFloat(earnings.total) - parseFloat(expTotal.total),
      total_bookings: parseInt(bkStats.total_bookings),
      cancelled:      parseInt(bkStats.cancelled),
      pending:        parseInt(bkStats.pending),
      confirmed:      parseInt(bkStats.confirmed),
      completed:      parseInt(bkStats.done_count),
      revenue_trend:  trendPct(parseFloat(earnings.total), parseFloat(prevEarnings.total)),
      expenses_trend: trendPct(parseFloat(expTotal.total), parseFloat(prevExpTotal.total)),
      net_trend:      trendPct(
                         parseFloat(earnings.total) - parseFloat(expTotal.total),
                         parseFloat(prevEarnings.total) - parseFloat(prevExpTotal.total)
                       ),
      bookings,
      expense_list:   expenses,
      expenses_by_category: expByCategory,
    });
  } catch (e) {
    console.error('getMonthlyReport error:', e.message);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
};

const getYearlyReport = async (req, res) => {
  const year = parseInt(req.query.year); // PG numeric param
  if (!year) return res.status(400).json({ message: 'Year is required.' });
  try {
    const monthly = await sequelize.query(`
      SELECT m.mo,
             COALESCE(e.earnings, 0) AS earnings,
             COALESCE(x.expenses, 0) AS expenses,
             COALESCE(e.earnings,0) - COALESCE(x.expenses,0) AS net
      FROM (SELECT 1 mo UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
            UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12) m
      LEFT JOIN (SELECT EXTRACT(MONTH FROM paid_at) mo, SUM(amount) earnings FROM payments WHERE EXTRACT(YEAR FROM paid_at)=? GROUP BY mo) e ON e.mo=m.mo
      LEFT JOIN (SELECT EXTRACT(MONTH FROM expense_date) mo, SUM(amount) expenses FROM expenses WHERE EXTRACT(YEAR FROM expense_date)=? GROUP BY mo) x ON x.mo=m.mo
      ORDER BY m.mo
    `, { replacements: [year, year], type: sequelize.QueryTypes.SELECT });

    const [[totals]] = await sequelize.query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM payments  WHERE EXTRACT(YEAR FROM paid_at)=?)      AS total_earnings,
        (SELECT COALESCE(SUM(amount),0) FROM expenses  WHERE EXTRACT(YEAR FROM expense_date)=?) AS total_expenses,
        (SELECT COUNT(*) FROM bookings WHERE EXTRACT(YEAR FROM date)=? AND status <> 'cancelled') AS total_bookings,
        (SELECT COUNT(*) FROM bookings WHERE EXTRACT(YEAR FROM date)=? AND status =  'cancelled') AS total_cancelled,
        (SELECT COUNT(*) FROM bookings WHERE EXTRACT(YEAR FROM date)=? AND status IN ('done','completed')) AS total_done
    `, { replacements: [year, year, year, year, year] });

    res.json({
      year,
      monthly,
      gross_revenue:   parseFloat(totals.total_earnings),
      total_earnings:  parseFloat(totals.total_earnings),
      total_expenses:  parseFloat(totals.total_expenses),
      net_income:      parseFloat(totals.total_earnings) - parseFloat(totals.total_expenses),
      net:             parseFloat(totals.total_earnings) - parseFloat(totals.total_expenses),
      total_bookings:  totals.total_bookings,
      total_cancelled: totals.total_cancelled,
      total_done:      totals.total_done,
    });
  } catch (e) {
    console.error('getYearlyReport error:', e.message);
    res.status(500).json({ message: 'Failed to generate yearly report.' });
  }
};


// ── GET /api/reports/range?from=&to= — revenue for an arbitrary date span ────
// Monthly and yearly answer fixed calendar periods; this answers "how did we do
// between these two dates". Returns the SAME shape as the monthly report so the
// Revenue tab can render all three period types with one component instead of
// three near-identical blocks.
const getRangeReport = async (req, res) => {
  const from = String(req.query.from || '').slice(0, 10);
  const to   = String(req.query.to   || '').slice(0, 10);
  if (!from || !to)
    return res.status(400).json({ message: 'Both a start and end date are required.' });
  if (from > to)
    return res.status(400).json({ message: 'The start date must be before the end date.' });

  try {
    const [[earnings]] = await sequelize.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE DATE(paid_at) BETWEEN ? AND ?',
      { replacements: [from, to] }
    );
    const [[expTotal]] = await sequelize.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?',
      { replacements: [from, to] }
    );
    const expByCategory = await sequelize.query(`
      SELECT category, SUM(amount) AS total
      FROM expenses WHERE expense_date BETWEEN ? AND ?
      GROUP BY category ORDER BY total DESC
    `, { replacements: [from, to], type: sequelize.QueryTypes.SELECT });

    const [[bkStats]] = await sequelize.query(`
      SELECT
        COUNT(CASE WHEN status <> 'cancelled' THEN 1 END)              AS total_bookings,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)           AS cancelled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)             AS pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)           AS confirmed,
        SUM(CASE WHEN status IN ('done','completed') THEN 1 ELSE 0 END) AS done_count
      FROM bookings WHERE date BETWEEN ? AND ?
    `, { replacements: [from, to] });

    res.json({
      from, to,
      gross_revenue:  parseFloat(earnings.total),
      total_expenses: parseFloat(expTotal.total),
      net_income:     parseFloat(earnings.total) - parseFloat(expTotal.total),
      total_bookings: parseInt(bkStats.total_bookings),
      cancelled:      parseInt(bkStats.cancelled),
      pending:        parseInt(bkStats.pending),
      confirmed:      parseInt(bkStats.confirmed),
      completed:      parseInt(bkStats.done_count),
      // Trends need a comparable previous period; a custom span has none, so
      // they are explicitly null rather than a misleading zero.
      revenue_trend: null, expenses_trend: null, net_trend: null,
      expenses_by_category: expByCategory,
    });
  } catch (e) {
    console.error('getRangeReport error:', e.message);
    res.status(500).json({ message: 'Failed to generate the report.' });
  }
};


// ── GET /api/reports/profit-loss?year= — P&L statement ──────────────────────
// Returns the requested year AND the one before it, so the statement can show
// the two side by side the way a real P&L does — a single year's figures tell
// you nothing about direction.
//
// Revenue is broken down by SERVICE (that's what the business actually sells)
// and expenses by CATEGORY, mirroring how each is recorded.
const getProfitLoss = async (req, res) => {
  // Period can be a calendar year, a calendar month, or an explicit span.
  // Whatever is asked for, the response also covers the SAME length of time
  // immediately before it, so the statement can compare like with like:
  // a month is compared to the previous month, not the previous year.
  const period = req.query.period || 'yearly';
  const year   = parseInt(req.query.year) || new Date().getFullYear();
  const month  = parseInt(req.query.month) || (new Date().getMonth() + 1);

  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(y, m, 0).getDate();

  let curFrom, curTo, prevFrom, prevTo, label, prevLabel;

  if (period === 'monthly') {
    curFrom  = `${year}-${pad(month)}-01`;
    curTo    = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    prevFrom = `${py}-${pad(pm)}-01`;
    prevTo   = `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`;
    const MONTHS = ['January','February','March','April','May','June','July',
                    'August','September','October','November','December'];
    label     = `${MONTHS[month - 1]} ${year}`;
    prevLabel = `${MONTHS[pm - 1]} ${py}`;
  } else if (period === 'range') {
    curFrom = String(req.query.from || '').slice(0, 10);
    curTo   = String(req.query.to   || '').slice(0, 10);
    if (!curFrom || !curTo)
      return res.status(400).json({ message: 'Both a start and end date are required.' });
    if (curFrom > curTo)
      return res.status(400).json({ message: 'The start date must be before the end date.' });
    // Compare against the immediately preceding span of equal length.
    const days = Math.round((new Date(curTo) - new Date(curFrom)) / 86400000) + 1;
    const pTo   = new Date(curFrom); pTo.setDate(pTo.getDate() - 1);
    const pFrom = new Date(pTo);     pFrom.setDate(pFrom.getDate() - (days - 1));
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    prevFrom = iso(pFrom); prevTo = iso(pTo);
    label     = `${curFrom} to ${curTo}`;
    prevLabel = `${prevFrom} to ${prevTo}`;
  } else {
    curFrom = `${year}-01-01`;      curTo = `${year}-12-31`;
    prevFrom = `${year - 1}-01-01`; prevTo = `${year - 1}-12-31`;
    label = String(year); prevLabel = String(year - 1);
  }

  const revenueByService = async (from, to) => sequelize.query(`
    SELECT s.name AS label, COALESCE(SUM(p.amount), 0) AS amount
    FROM payments p
    JOIN bookings b ON b.id = p.booking_id
    JOIN services s ON s.id = b.service_id
    WHERE DATE(p.paid_at) BETWEEN ? AND ?
    GROUP BY s.name
    ORDER BY amount DESC
  `, { replacements: [from, to], type: sequelize.QueryTypes.SELECT });

  const expensesByCategory = async (from, to) => sequelize.query(`
    SELECT category AS label, COALESCE(SUM(amount), 0) AS amount
    FROM expenses
    WHERE expense_date BETWEEN ? AND ?
    GROUP BY category
    ORDER BY amount DESC
  `, { replacements: [from, to], type: sequelize.QueryTypes.SELECT });

  try {
    const [revCur, revPrev, expCur, expPrev] = await Promise.all([
      revenueByService(curFrom, curTo), revenueByService(prevFrom, prevTo),
      expensesByCategory(curFrom, curTo), expensesByCategory(prevFrom, prevTo),
    ]);

    // Merge both years onto one row per label so the statement lines up even
    // when a service or category exists in only one of the two years.
    const merge = (cur, prv) => {
      const labels = [...new Set([...cur.map(r => r.label), ...prv.map(r => r.label)])];
      return labels.map(label => ({
        label,
        current:  parseFloat(cur.find(r => r.label === label)?.amount || 0),
        previous: parseFloat(prv.find(r => r.label === label)?.amount || 0),
      })).sort((a, b) => b.current - a.current);
    };

    const revenue  = merge(revCur, revPrev);
    const expenses = merge(expCur, expPrev);
    const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);

    res.json({
      period, label, previous_label: prevLabel,
      from: curFrom, to: curTo,
      revenue,
      expenses,
      totals: {
        revenue_current:  sum(revenue, 'current'),
        revenue_previous: sum(revenue, 'previous'),
        expenses_current:  sum(expenses, 'current'),
        expenses_previous: sum(expenses, 'previous'),
        // No tax line: the business is not VAT-registered, so net profit is
        // simply revenue less expenses. Stated explicitly rather than showing
        // a zero tax row that implies a calculation that isn't happening.
        net_current:  sum(revenue, 'current')  - sum(expenses, 'current'),
        net_previous: sum(revenue, 'previous') - sum(expenses, 'previous'),
      },
    });
  } catch (e) {
    console.error('getProfitLoss error:', e.message);
    res.status(500).json({ message: 'Failed to generate the statement.' });
  }
};

const getScheduleLogs = async (req, res) => {
  try {
    const logs = await sequelize.query(`
      SELECT b.*, u.name AS client_name, s.name AS service_name
      FROM bookings b
      JOIN users    u ON u.id = b.client_id
      JOIN services s ON s.id = b.service_id
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT 100
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(logs);
  } catch (e) { res.status(500).json({ message: 'Failed to fetch logs.' }); }
};


const getServiceStats = async (req, res) => {
  const year = parseInt(req.query.year); // PG numeric param
  try {
    // The year filter belongs in the JOIN condition, not WHERE. In WHERE it
    // discards the NULL rows a LEFT JOIN produces, so a service with no
    // bookings in that year vanished from Service Stats instead of showing 0.
    const where = year ? `AND EXTRACT(YEAR FROM b.date) = ${parseInt(year)}` : '';
    const rows = await sequelize.query(`
      -- Cancelled bookings excluded so the service mix reflects work actually
      -- taken on, matching the totals shown elsewhere in Reports.
      SELECT s.name AS service_name,
             COUNT(CASE WHEN b.status <> 'cancelled' THEN 1 END) AS total_bookings,
             SUM(CASE WHEN b.status IN ('done','completed') THEN 1 ELSE 0 END) AS completed
      FROM services s
      LEFT JOIN bookings b ON b.service_id = s.id ${where}
      GROUP BY s.id, s.name
      ORDER BY total_bookings DESC
    `, { type: sequelize.QueryTypes.SELECT });
    res.json(rows);
  } catch (e) {
    console.error('getServiceStats error:', e.message);
    res.status(500).json({ message: 'Failed to fetch service stats.' });
  }
};


const getPublicStats = async (req, res) => {
  try {
    const [[clients]] = await sequelize.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'client'"
    );
    const [[done]] = await sequelize.query(
      "SELECT COUNT(*) AS total FROM bookings WHERE status IN ('done','completed')"
    );
    res.json({ total_clients: parseInt(clients.total), services_done: parseInt(done.total) });
  } catch (e) {
    res.json({ total_clients: 0, services_done: 0 });
  }
};

module.exports = {
  getDashboard, getMonthlyReport, getYearlyReport, getRangeReport, getProfitLoss,
  getScheduleLogs, getServiceStats, getPublicStats,
};
