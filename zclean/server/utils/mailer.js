const nodemailer = require('nodemailer');

const BRAND = `
  <div style="background:#16a34a;padding:18px 24px;border-radius:12px 12px 0 0;">
    <h2 style="color:white;margin:0;font-size:18px;font-weight:900;letter-spacing:-0.5px;">Z's Cleaning Services</h2>
    <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">Calbayog City, Samar</p>
  </div>`;

const createTransporter = () => nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
  // ── Fail fast instead of hanging ──────────────────────────────────────────
  // Some hosts (Render's free tier among them) block outbound SMTP ports. A
  // blocked port does not refuse the connection — it swallows it, so without
  // these the send sits waiting for nodemailer's default two-minute socket
  // timeout. Anything awaiting the send inherits that wait.
  //
  // With these, a blocked or unreachable mail server is reported in about ten
  // seconds and the error reaches the log, where it can be acted on.
  connectionTimeout: 8000,   // TCP connect
  greetingTimeout:   8000,   // waiting for the server's 220 banner
  socketTimeout:    10000,   // inactivity once connected
});

// ── How mail actually leaves this server ─────────────────────────────────────
// Two routes, chosen automatically:
//
//   BREVO_API_KEY set  → Brevo's HTTPS API. Used in deployment, because hosts
//                        like Render's free tier BLOCK outbound SMTP ports.
//                        Port 443 is never blocked, so this works where SMTP
//                        cannot.
//   otherwise          → Gmail SMTP, exactly as before. Local development
//                        needs no changes and no Brevo account.
//
// Every template below is unchanged; only the delivery step differs.
const FROM_NAME = "Z's Cleaning Services";

// The address recipients see. Brevo requires this to be a sender you have
// verified in their dashboard; with SMTP it is the Gmail account itself.
const fromAddress = () =>
  (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim();

// True when EITHER route is usable. Replaces the old SMTP-only check, so a
// Brevo-only deployment is correctly treated as configured.
const mailConfigured = () =>
  !!(process.env.BREVO_API_KEY || '').trim() ||
  !!((process.env.SMTP_USER || '').trim() && (process.env.SMTP_PASS || '').trim());

async function deliver({ to, subject, html }) {
  const key = (process.env.BREVO_API_KEY || '').trim();

  if (key) {
    if (typeof fetch !== 'function')
      throw new Error('Node 18 or newer is required to send through Brevo.');

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key':      key,
        'content-type': 'application/json',
        'accept':       'application/json',
      },
      body: JSON.stringify({
        sender:      { name: FROM_NAME, email: fromAddress() },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
      // Never let a hung request hold up whatever is awaiting this.
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Brevo explains refusals in the body — an unverified sender address is
      // the usual one. Surfacing it saves a long hunt.
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo responded ${res.status}: ${detail.slice(0, 300)}`);
    }
    return;
  }

  const t = createTransporter();
  await t.sendMail({ from: `"${FROM_NAME}" <${fromAddress()}>`, to, subject, html });
}

// ── OTP Email ─────────────────────────────────────────────────────────────────
exports.sendOtpEmail = async ({ to, name, otp }) => {
  // Always print OTP to server console regardless of SMTP config
  console.log('\n========================================');
  console.log(`  OTP for ${to}  →  ${otp}  (15 min)`);
  console.log('========================================\n');

  // If SMTP not configured at all — return special error so controller handles it
  if (!mailConfigured()) {
    const err = new Error('SMTP_NOT_CONFIGURED');
    err.devOtp = otp;
    throw err;
  }

  // Send actual email — let errors bubble up to controller
  await deliver({
    to,
    subject: `Your Password Reset Code — Z's Cleaning Services`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        ${BRAND}
        <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
          <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${name},</p>
          <p style="color:#4b5563;font-size:14px;margin:0 0 20px;">
            Your password reset code — expires in <strong>15 minutes</strong>:
          </p>
          <div style="text-align:center;padding:20px;background:#fff;border-radius:12px;border:2px dashed #16a34a;margin-bottom:20px;">
            <span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#16a34a;font-family:monospace;">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:13px;">
            Do not share this code. If you didn't request this, ignore this email.
          </p>
        </div>
      </div>`,
  });
};

// ── Booking Confirmation ──────────────────────────────────────────────────────
exports.sendBookingConfirmation = async ({ to, name, bookingId, serviceName, date, timeStart, location, paymentMethod }) => {
  if (!mailConfigured()) {
    console.log(`📧 [No SMTP] Confirmation skipped for booking #${bookingId} → ${to}`);
    return;
  }
  try {
    await deliver({
      to,
      subject: `Booking Received — Pending Confirmation | Z's Cleaning Services`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${name}!</p>
            <p style="color:#4b5563;font-size:14px;margin:0 0 20px;">Your booking has been <strong>received</strong> and is <strong>pending confirmation</strong>. We'll notify you once it's confirmed.</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr><td style="padding:5px 0;color:#6b7280;">Booking #</td><td style="font-weight:700;">#${bookingId}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;">Service</td><td style="font-weight:700;">${serviceName}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;">Date</td><td style="font-weight:700;">${date}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;">Time</td><td style="font-weight:700;">${timeStart}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;">Location</td><td style="font-weight:700;">${location}</td></tr>
              <tr><td style="padding:5px 0;color:#6b7280;">Payment</td><td style="font-weight:700;text-transform:capitalize;">${paymentMethod}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${fromAddress() || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Confirmation email error:', e.message);
  }
};


// ── Admin Confirmed Booking Email ─────────────────────────────────────────────
exports.sendBookingConfirmedEmail = async ({ to, name, bookingId, serviceName, date, timeStart, location, paymentMethod, total }) => {
  if (!mailConfigured()) {
    console.log(`📧 [No SMTP] Confirmed email skipped for booking #${bookingId} → ${to}`);
    return;
  }
  try {
    await deliver({
      to,
      subject: `Booking Confirmed! #${bookingId} — Z's Cleaning Services`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 0 0;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${name}!</p>
            <p style="color:#16a34a;font-size:15px;font-weight:700;margin:0 0 20px;">✅ Your booking has been confirmed!</p>
            <p style="color:#4b5563;font-size:13px;margin:0 0 16px;">Please see your booking details below. See you on the day!</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
              <tr style="background:#f0fdf4;"><td colspan="2" style="padding:8px 10px;font-weight:700;color:#166534;border-radius:6px 6px 0 0;">📋 Booking Details</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;width:40%;">Booking #</td><td style="padding:8px 10px;font-weight:700;">#${bookingId}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Service</td><td style="padding:8px 10px;font-weight:700;">${serviceName}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Date</td><td style="padding:8px 10px;font-weight:700;">${date}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Time</td><td style="padding:8px 10px;font-weight:700;">${timeStart}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Location</td><td style="padding:8px 10px;font-weight:700;">${location}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Payment</td><td style="padding:8px 10px;font-weight:700;text-transform:capitalize;">${paymentMethod}</td></tr>
              ${total ? `<tr style="background:#f0fdf4;"><td style="padding:8px 10px;color:#6b7280;font-weight:700;">Total</td><td style="padding:8px 10px;font-weight:900;color:#16a34a;font-size:15px;">₱${Number(total).toLocaleString()}</td></tr>` : ''}
            </table>
            <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="color:#92400e;font-size:13px;margin:0;"><strong>📌 Reminder:</strong> Service starts at <strong>9:00 AM</strong>. Please ensure someone is home and the area is accessible for our cleaners.</p>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;">Questions? Call us at <strong>0916-213-3460</strong>.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${fromAddress() || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
          </div>
          <!-- Printable Receipt -->
          <div style="background:#fff;padding:20px 24px;border:1px solid #e5e7eb;border-top:2px dashed #d1d5db;border-radius:0 0 12px 12px;">
            <p style="text-align:center;color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">— Booking Receipt —</p>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <tr><td style="color:#6b7280;padding:3px 0;">Receipt for</td><td style="text-align:right;font-weight:700;">${name}</td></tr>
              <tr><td style="color:#6b7280;padding:3px 0;">Booking #</td><td style="text-align:right;font-weight:700;">#${bookingId}</td></tr>
              <tr><td style="color:#6b7280;padding:3px 0;">Service</td><td style="text-align:right;font-weight:700;">${serviceName}</td></tr>
              <tr><td style="color:#6b7280;padding:3px 0;">Date &amp; Time</td><td style="text-align:right;font-weight:700;">${date} · ${timeStart}</td></tr>
              ${total ? `<tr style="border-top:1px solid #e5e7eb;"><td style="padding-top:8px;font-weight:700;color:#111;">Amount Due</td><td style="text-align:right;font-weight:900;font-size:14px;color:#16a34a;padding-top:8px;">₱${Number(total).toLocaleString()}</td></tr>` : ''}
            </table>
            <p style="text-align:center;color:#9ca3af;font-size:11px;margin:14px 0 0;">Z's Cleaning Services · Calbayog City, Samar · 0916-213-3460</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Confirmed email error:', e.message);
  }
};

// ── Reminder Email ────────────────────────────────────────────────────────────
exports.sendReminderEmail = async ({ to, name, serviceName, date, timeStart, location }) => {
  if (!mailConfigured()) return;
  try {
    await deliver({
      to,
      subject: `Reminder: Your cleaning service is tomorrow!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${name}!</p>
            <p style="color:#4b5563;font-size:14px;">
              Reminder: your <strong>${serviceName}</strong> is scheduled for 
              <strong>tomorrow, ${date}</strong> at <strong>${timeStart}</strong> at ${location}.
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${fromAddress() || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Reminder email error:', e.message);
  }
};

// 2-hour "starting soon" reminder — same guard, transporter, and visual
// template as sendReminderEmail above; only the subject and copy differ.
exports.sendStartingSoonEmail = async ({ to, name, serviceName, date, timeStart, location }) => {
  if (!mailConfigured()) return;
  try {
    await deliver({
      to,
      subject: `Your cleaning service starts in about 2 hours!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${name}!</p>
            <p style="color:#4b5563;font-size:14px;">
              Heads up — your <strong>${serviceName}</strong> starts in about
              <strong>2 hours</strong> (today, ${date} at <strong>${timeStart}</strong>) at ${location}.
              Our team is on the way soon!
            </p>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${fromAddress() || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Starting-soon email error:', e.message);
  }
};

// Security notice sent to the PREVIOUS address when a user changes their
// email, so the real owner can react if the change wasn't theirs.
exports.sendEmailChangedNotice = async ({ to, name, newEmail }) => {
  if (!mailConfigured()) return;
  try {
    await deliver({
      to,
      subject: 'Your ZClean email address was changed',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 8px;">Hi ${name},</p>
            <p style="color:#4b5563;font-size:14px;">
              The email address on your ZClean account was changed to
              <strong>${newEmail}</strong>. Future booking updates and reminders
              will be sent there.
            </p>
            <p style="color:#4b5563;font-size:14px;">
              If you did not make this change, please call us right away at
              <strong>0916-213-3460</strong>.
            </p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Email-changed notice error:', e.message);
  }
};

// ── GCash Receipt Rejected ────────────────────────────────────────────────────
// Sent when the admin checks an uploaded receipt and turns it down — the amount
// is short, the reference number is not in the business GCash record, or the
// image has been altered. A rejection must never be silent: the client is told
// why, and told exactly what to do next, otherwise the booking simply stops
// moving and they are left guessing.
exports.sendReceiptRejectedEmail = async ({ to, name, bookingId, serviceName, date, reason }) => {
  if (!mailConfigured()) {
    console.log(`📧 [No mailer] Receipt-rejected email skipped for booking #${bookingId} → ${to}`);
    return;
  }
  try {
    await deliver({
      to,
      subject: `Action needed: GCash receipt for booking #${bookingId} — Z's Cleaning Services`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
          ${BRAND}
          <div style="background:#f9fafb;padding:28px 24px;border:1px solid #e5e7eb;">
            <p style="color:#111;font-size:16px;font-weight:700;margin:0 0 6px;">Hi ${name},</p>
            <p style="color:#b91c1c;font-size:15px;font-weight:700;margin:0 0 20px;">We could not verify the GCash receipt for your booking.</p>
            <p style="color:#4b5563;font-size:13px;margin:0 0 16px;">Your booking is still saved, but the schedule is not yet held. Please send a new receipt so we can confirm it for you.</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
              <tr style="background:#fef2f2;"><td colspan="2" style="padding:8px 10px;font-weight:700;color:#991b1b;border-radius:6px 6px 0 0;">Booking Details</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;width:40%;">Booking #</td><td style="padding:8px 10px;font-weight:700;">#${bookingId}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Service</td><td style="padding:8px 10px;font-weight:700;">${serviceName}</td></tr>
              <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 10px;color:#6b7280;">Date</td><td style="padding:8px 10px;font-weight:700;">${date}</td></tr>
            </table>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
              <p style="color:#991b1b;font-size:13px;margin:0;"><strong>Reason:</strong> ${reason}</p>
            </div>
            <p style="color:#4b5563;font-size:13px;margin:0 0 8px;font-weight:700;">What to do next</p>
            <p style="color:#4b5563;font-size:13px;margin:0 0 16px;line-height:1.6;">Open <strong>My Bookings</strong> in your account, find booking #${bookingId}, and upload a new GCash receipt. Please include the reference number shown in your GCash app so we can match the payment.</p>
            <p style="color:#9ca3af;font-size:12px;margin:0;">Questions? Call us at <strong>0916-213-3460</strong> or message us in the app.</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Receipt-rejected email error:', e.message);
  }
};
