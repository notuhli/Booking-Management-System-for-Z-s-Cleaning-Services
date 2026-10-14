const { Sequelize } = require('sequelize');

// ── Dual-mode connection ─────────────────────────────────────────────────────
// If DATABASE_URL is set  → Supabase (PostgreSQL). Use the SESSION POOLER
//   connection string from Supabase → Project Settings → Database (a long-
//   running Express server needs session mode, not transaction mode).
// If DATABASE_URL is unset → local MySQL/XAMPP, exactly as before.
// Cutover and rollback are therefore a single .env change.

let sequelize;

if (process.env.DATABASE_URL) {
  // ── Make the pg driver return data shaped like the MySQL driver did ──
  // Without these, three classes of silent bugs appear:
  //   1. DATE columns arrive as JS Date objects that serialize with a
  //      timezone shift (PH = UTC+8 ⇒ every date shows the PREVIOUS day
  //      after .slice(0,10) on the frontend). Keep them as 'YYYY-MM-DD'.
  //   2. COUNT()/BIGINT arrive as strings ("5"), breaking === comparisons.
  //   3. SUM()/DECIMAL arrive as strings ("1500.00"), so a + b concatenates.
  const pgTypes = require('pg').types;
  pgTypes.setTypeParser(1082, (v) => v);              // DATE    → plain string
  pgTypes.setTypeParser(20,   (v) => parseInt(v, 10)); // BIGINT  → number
  pgTypes.setTypeParser(1700, (v) => parseFloat(v));   // NUMERIC → number

  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }, // Supabase requires SSL
    },
    // ── Keep connections warm ────────────────────────────────────────────
    // This was min: 0, idle: 10000, which kept NO connection open and closed
    // any connection after 10 seconds of inactivity. Every click after a short
    // pause therefore paid for a brand-new connection: TCP handshake, TLS
    // handshake, Postgres auth, and the SET TIME ZONE hook below — before a
    // single query ran. Pages that fire several requests at once opened
    // several such connections at once.
    //   min: 2      two connections stay ready, so a normal click uses one.
    //   idle: 60000 a connection survives a minute of idling instead of ten
    //               seconds, which covers reading and typing.
    // Supabase's session pooler allows far more than this, so it costs nothing.
    pool: { max: 10, min: 2, acquire: 30000, idle: 60000 },
  });
  // Pin every session to Philippine time so NOW()/CURRENT_DATE in the
  // scheduler and report queries behave like the local MySQL setup did.
  sequelize.addHook('afterConnect', async (connection) => {
    await connection.query("SET TIME ZONE 'Asia/Manila'");
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'zclean_db',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
      host:    process.env.DB_HOST || 'localhost',
      port:    parseInt(process.env.DB_PORT) || 3306,
      dialect: 'mysql',
      logging: false,
      // Pin the MySQL session to Philippine time so NOW() in the reminder
      // queries stays correct on hosted servers (which usually run UTC).
      timezone: '+08:00',
      // Same reasoning as the Postgres branch above. A local MySQL handshake is
      // cheap, so this matters less here, but keeping the two branches
      // consistent avoids a surprise when switching between them.
      pool: { max: 10, min: 2, acquire: 30000, idle: 60000 },
      dialectOptions: { enableKeepAlive: true, keepAliveInitialDelay: 0 },
    }
  );
}

module.exports = sequelize;
