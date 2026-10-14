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
});

// ── OTP Email ─────────────────────────────────────────────────────────────────
exports.sendOtpEmail = async ({ to, name, otp }) => {
  // Always print OTP to server console regardless of SMTP config
  console.log('\n========================================');
  console.log(`  OTP for ${to}  →  ${otp}  (15 min)`);
  console.log('========================================\n');

  // If SMTP not configured at all — return special error so controller handles it
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') {
    const err = new Error('SMTP_NOT_CONFIGURED');
    err.devOtp = otp;
    throw err;
  }

  // Send actual email — let errors bubble up to controller
  const t = createTransporter();
  await t.sendMail({
    from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') {
    console.log(`📧 [No SMTP] Confirmation skipped for booking #${bookingId} → ${to}`);
    return;
  }
  try {
    const t = createTransporter();
    await t.sendMail({
      from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
            <p style="color:#9ca3af;font-size:12px;margin-top:20px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${process.env.SMTP_USER || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
          </div>
        </div>`,
    });
  } catch (e) {
    console.error('Confirmation email error:', e.message);
  }
};


// ── Admin Confirmed Booking Email ─────────────────────────────────────────────
exports.sendBookingConfirmedEmail = async ({ to, name, bookingId, serviceName, date, timeStart, location, paymentMethod, total }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') {
    console.log(`📧 [No SMTP] Confirmed email skipped for booking #${bookingId} → ${to}`);
    return;
  }
  try {
    const t = createTransporter();
    await t.sendMail({
      from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
            <p style="color:#9ca3af;font-size:12px;margin:0;">Questions? Call us at <strong>0916-213-3460</strong>.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${process.env.SMTP_USER || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') return;
  try {
    const t = createTransporter();
    await t.sendMail({
      from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${process.env.SMTP_USER || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') return;
  try {
    const t = createTransporter();
    await t.sendMail({
      from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">Questions? Call 0916-213-3460.</p><p style="color:#9ca3af;font-size:11px;margin-top:14px;line-height:1.5;">Not seeing our emails? Check your <strong>Spam</strong> or <strong>Promotions</strong> folder and mark this message as <strong>&ldquo;Not spam&rdquo;</strong>, or add <strong>${process.env.SMTP_USER || "our email"}</strong> to your contacts so booking updates and reminders reach your inbox.</p>
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
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS ||
      process.env.SMTP_USER.trim() === '' || process.env.SMTP_PASS.trim() === '') return;
  try {
    const t = createTransporter();
    await t.sendMail({
      from:    `"Z's Cleaning Services" <${process.env.SMTP_USER}>`,
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
