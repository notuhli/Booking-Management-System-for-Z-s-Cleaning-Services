// ── SQL dialect helper ───────────────────────────────────────────────────────
// The app runs dual-mode: local MySQL (no DATABASE_URL) or Supabase Postgres
// (DATABASE_URL set). Raw queries route dialect-specific fragments through
// here so every controller works on both without duplication.

const isPg = !!process.env.DATABASE_URL;

module.exports = {
  isPg,

  // Combine separate DATE + TIME columns into a comparable timestamp.
  // MySQL: TIMESTAMP(d, t)  |  Postgres: (d + t)
  ts: (d, t) => (isPg ? `(${d} + ${t})` : `TIMESTAMP(${d}, ${t})`),

  // NOW() shifted forward by N hours.
  addHours: (n) => (isPg ? `NOW() + INTERVAL '${n} hours'` : `DATE_ADD(NOW(), INTERVAL ${n} HOUR)`),

  // EXTRACT works on both dialects — use these instead of YEAR()/MONTH().
  year:  (col) => `EXTRACT(YEAR FROM ${col})`,
  month: (col) => `EXTRACT(MONTH FROM ${col})`,

  // 'Jul 2026' style month label.
  mLabel: (col) => (isPg ? `TO_CHAR(${col}, 'Mon YYYY')` : `DATE_FORMAT(${col}, '%b %Y')`),

  // 'Jul 07, 2026' style date label.
  dLabel: (col) => (isPg ? `TO_CHAR(${col}, 'Mon DD, YYYY')` : `DATE_FORMAT(${col}, '%b %d, %Y')`),

  // NOW() shifted back by N months.
  subMonths: (n) => (isPg ? `NOW() - INTERVAL '${n} months'` : `DATE_SUB(NOW(), INTERVAL ${n} MONTH)`),

  // Month label like '2026-07'.
  // MySQL: DATE_FORMAT(col, '%Y-%m')  |  Postgres: TO_CHAR(col, 'YYYY-MM')
  ym: (col) => (isPg ? `TO_CHAR(${col}, 'YYYY-MM')` : `DATE_FORMAT(${col}, '%Y-%m')`),

  // Concatenate grouped values with a separator.
  // MySQL: GROUP_CONCAT(expr SEPARATOR 'sep')  |  PG: STRING_AGG(expr, 'sep')
  // (PG's STRING_AGG needs text — expr is cast for safety.)
  groupConcat: (expr, sep) =>
    isPg ? `STRING_AGG((${expr})::text, '${sep}')` : `GROUP_CONCAT(${expr} SEPARATOR '${sep}')`,

  // Insert that silently skips duplicates on `conflictCol`.
  insertIgnore: (table, cols, placeholders, conflictCol) =>
    isPg
      ? `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT (${conflictCol}) DO NOTHING`
      : `INSERT IGNORE INTO ${table} (${cols}) VALUES (${placeholders})`,

  // Run an INSERT and reliably return the new row id on both dialects.
  // MySQL: sequelize returns [insertId]  |  Postgres: needs RETURNING id.
  // (PG result shape from sequelize can be [rows, count] or rows depending
  // on version/type detection — handle both.)
  // `options` is optional and additive — existing callers pass nothing and
  // behave exactly as before. It exists so an insert can join a transaction
  // ({ transaction: t }), which the booking capacity guard needs.
  insertGetId: async (sequelize, sql, replacements, options = {}) => {
    if (isPg) {
      const out = await sequelize.query(`${sql} RETURNING id`, { replacements, ...options });
      const rows = Array.isArray(out) && Array.isArray(out[0]) ? out[0] : out;
      return rows?.[0]?.id ?? rows?.id;
    }
    const [id] = await sequelize.query(sql, { replacements, ...options });
    return id;
  },
};
