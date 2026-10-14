const cron      = require('node-cron');
const sequelize = require('../models/db');
const dl = require('../utils/sql-dialect');
const { sendReminderEmail, sendStartingSoonEmail } = require('./mailer');

exports.startReminderScheduler = () => {
  // ── Day-before reminder ──
  // Previously fired ONLY at exactly 8:00 AM — if the server was off at that
  // moment, the whole day's reminders were silently skipped. Now: each send
  // is logged as a client_notifications row (type 'reminder_24h', which also
  // surfaces it in the client's bell), the NOT EXISTS clause makes re-runs
  // safe, and the check runs at startup as well as 8 AM — so a server booted
  // at 10 AM still sends that day's missed reminders exactly once.
  const runDailyCheck = async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      // 'en-CA' gives YYYY-MM-DD in LOCAL time. toISOString() is UTC, which in
      // Philippine time (UTC+8) reports the previous day between midnight and
      // 8 AM. On a restart in those hours the "tomorrow" check resolved to
      // TODAY: today's clients were emailed "your service is tomorrow", and the
      // dedup row that burned meant tomorrow's real reminder never went out.
      const dateStr = tomorrow.toLocaleDateString('en-CA');

      const bookings = await sequelize.query(`
        SELECT b.id, b.client_id, b.date, b.time_start, b.location,
               u.name, u.email,
               s.name AS service_name
        FROM bookings b
        JOIN users    u ON u.id = b.client_id
        JOIN services s ON s.id = b.service_id
        WHERE b.date = ? AND b.status IN ('pending','confirmed')
          AND NOT EXISTS (
            SELECT 1 FROM client_notifications cn
            WHERE cn.booking_id = b.id AND cn.type = 'reminder_24h'
          )
      `, { replacements: [dateStr], type: sequelize.QueryTypes.SELECT });

      for (const b of bookings) {
        // Record first (dedup lock + bell notification), then email.
        await sequelize.query(`
          INSERT INTO client_notifications (user_id, booking_id, message, type)
          VALUES (?, ?, ?, 'reminder_24h')
        `, { replacements: [
          b.client_id, b.id,
          `Reminder: your ${b.service_name} is tomorrow at ${b.time_start}.`,
        ]});
        await sendReminderEmail({
          to:          b.email,
          name:        b.name,
          serviceName: b.service_name,
          date:        b.date,
          timeStart:   b.time_start,
          location:    b.location,
        });
        console.log(`✅ Reminder sent to ${b.email} for booking #${b.id}`);
      }
    } catch (e) {
      console.error('Scheduler error:', e.message);
    }
  };
  // Once shortly after startup (catch-up for missed 8 AMs), then daily at
  // 8 AM pinned to Philippine time — on hosted servers the system clock is
  // usually UTC, where an unpinned '0 8 * * *' would fire at 4 PM PH time.
  setTimeout(runDailyCheck, 12000);
  cron.schedule('0 8 * * *', runDailyCheck, { timezone: 'Asia/Manila' });

  // ── 2-hour "starting soon" reminder ──
  // Runs once ~10s after server start (so testing never requires waiting for
  // a cron tick) and then every 15 minutes. Finds CONFIRMED bookings whose
  // start datetime is within the next 2 hours (full TIMESTAMP comparison, so
  // early-morning bookings correctly trigger late the previous night).
  // Deduplication: each send inserts a client_notifications row with type
  // 'reminder_2h', and the NOT EXISTS clause skips bookings that already have
  // one — so restarts or overlapping runs can never double-email a client.
  // The inserted row also surfaces the reminder in the client's in-app bell.
  const runTwoHourCheck = async () => {
    try {
      const bookings = await sequelize.query(`
        SELECT b.id, b.client_id, b.date, b.time_start, b.location,
               u.name, u.email,
               s.name AS service_name
        FROM bookings b
        JOIN users    u ON u.id = b.client_id
        JOIN services s ON s.id = b.service_id
        WHERE b.status = 'confirmed'
          AND ${dl.ts('b.date','b.time_start')} >  NOW()
          AND ${dl.ts('b.date','b.time_start')} <= ${dl.addHours(2)}
          AND NOT EXISTS (
            SELECT 1 FROM client_notifications cn
            WHERE cn.booking_id = b.id AND cn.type = 'reminder_2h'
          )
      `, { type: sequelize.QueryTypes.SELECT });

      for (const b of bookings) {
        // Record first (acts as the dedup lock), then email.
        await sequelize.query(`
          INSERT INTO client_notifications (user_id, booking_id, message, type)
          VALUES (?, ?, ?, 'reminder_2h')
        `, { replacements: [
          b.client_id, b.id,
          `Reminder: your ${b.service_name} starts at ${b.time_start} today. Our team will be there soon!`,
        ]});
        await sendStartingSoonEmail({
          to:          b.email,
          name:        b.name,
          serviceName: b.service_name,
          date:        b.date,
          timeStart:   b.time_start,
          location:    b.location,
        });
        console.log(`✅ 2-hour reminder sent to ${b.email} for booking #${b.id}`);
      }
    } catch (e) {
      console.error('2-hour reminder scheduler error:', e.message);
    }
  };
  // Once shortly after startup (small delay lets the DB connection settle),
  // then on the quarter-hours.
  setTimeout(runTwoHourCheck, 10000);
  cron.schedule('*/15 * * * *', runTwoHourCheck, { timezone: 'Asia/Manila' });

  console.log('📅 Reminder scheduler started');
};
