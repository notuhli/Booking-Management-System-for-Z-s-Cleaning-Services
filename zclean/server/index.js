require('dotenv').config();
// Default the process clock to Philippine time so new Date() and schedulers
// behave identically on local XAMPP and on hosted servers (usually UTC).
// An explicit TZ in the environment still wins.
process.env.TZ = process.env.TZ || 'Asia/Manila';
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { receiptGuard } = require('./middleware/receipt-guard');
const storage = require('./utils/storage');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();

// ── Which proxies to believe about the client's IP ───────────────────────────
// Requests do not arrive straight from the browser: in development the Vite dev
// server proxies /api to this server, and in deployment a host's proxy usually
// sits in front. Each adds an `X-Forwarded-For` header naming the original
// caller. Express ignores that header by default, so every request looked like
// it came from the proxy itself — which would put all users in ONE rate-limit
// bucket, and is why express-rate-limit logs a warning about it.
//
// 'loopback' trusts only 127.0.0.1 and ::1 — the Vite proxy, running on this
// same machine. That is the safe setting: trusting every proxy (`true`) would
// let anyone send their own X-Forwarded-For and get a fresh rate-limit
// allowance on each request, defeating the limits added in Phases 2 and 5.
//
// When deploying behind one hosting proxy, set TRUST_PROXY=1 in .env.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', methods: ['GET','POST'] },
});

// Ensure upload dirs exist
['uploads/services','uploads/gcash','uploads/receipts'].forEach(dir => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// ── Security headers ─────────────────────────────────────────────────────────
// helmet sets the defensive HTTP headers this API had none of: nosniff (stops a
// browser guessing a file is HTML when it isn't), X-Frame-Options (stops the
// API being framed), Referrer-Policy, and HSTS once it runs over HTTPS.
//
// Two deliberate settings:
//   contentSecurityPolicy — OFF. A CSP restricts what an HTML PAGE may load,
//     and this server returns JSON and images; the React app is served by Vite
//     in development and by the host in production, which is where a CSP
//     belongs. Sending one here would protect nothing.
//   crossOriginResourcePolicy — 'cross-origin'. helmet's default is
//     same-origin, which would block the browser from loading service photos,
//     the GCash QR and payment receipts from this server, since the client runs
//     on a different port. Left at the default it breaks every image in the app.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));

// ── Global rate limit ────────────────────────────────────────────────────────
// Login, registration and OTP requests already have their own tight limits.
// This is the backstop for everything else: it does not stop a person using the
// site — a busy admin session is well under 300 requests in 15 minutes — but it
// stops a script hammering the API to scrape data or exhaust the free-tier
// database connection pool.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: 'Too many requests. Please slow down and try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);
// Cap the JSON body. Without a limit, a single request could hand the server a
// body large enough to exhaust its memory. 1 MB is far more than any form here
// sends; file uploads go through multer, which has its own limits.
app.use(express.json({ limit: '1mb' }));
// Payment receipts are checked before they are served: the admin sees any, a
// client sees only their own. Mounted BEFORE the public static handler, so the
// guard cannot be walked around. Service photos, the GCash QR and chat images
// stay public — they are meant to be seen.
app.use('/uploads/receipts', receiptGuard);

// Files are read back through storage.js rather than straight off the disk,
// because on a host with an ephemeral filesystem the disk is empty again after
// every restart. storage.js serves them from Supabase Storage when it is
// configured and from the local uploads/ folder otherwise, so this one route
// covers both and the stored URLs never changed.
app.get('/uploads/:folder/:filename', async (req, res) => {
  const { folder, filename } = req.params;
  // Only the four known folders, and no path traversal out of them.
  if (!['services', 'gcash', 'receipts', 'chat'].includes(folder) ||
      /[\\/]|\.\./.test(filename)) {
    return res.status(404).end();
  }
  try {
    const file = await storage.get(folder, filename);
    if (!file) return res.status(404).end();
    res.set('Content-Type', file.contentType);
    res.set('Cache-Control', folder === 'receipts'
      ? 'private, max-age=300'       // a receipt is one person's payment record
      : 'public, max-age=86400');
    res.send(file.buffer);
  } catch (e) {
    console.error('serve upload error:', e.message);
    res.status(500).end();
  }
});

// Routes
app.use('/api/auth',          require('./routes/auth-routes'));
app.use('/api/services',      require('./routes/service-routes'));
app.use('/api/bookings',      require('./routes/booking-routes'));
app.use('/api/expenses',      require('./routes/expense-routes'));
app.use('/api/payments',      require('./routes/payment-routes'));
app.use('/api/reports',       require('./routes/report-routes'));
app.use('/api/reviews',       require('./routes/review-routes'));
app.use('/api/global-addons', require('./routes/global-addon-routes'));
app.use('/api/settings',      require('./routes/settings-routes'));
app.use('/api/transport-fees',require('./routes/transport-fee-routes'));
app.use('/api/calendar',      require('./routes/calendar-routes'));
app.use('/api/notifications', require('./routes/notification-routes'));
app.use('/api/profile',       require('./routes/profile-routes'));
app.use('/api/clients',       require('./routes/client-routes'));
app.use('/api/messages',      require('./routes/message-routes'));
app.use('/api/notes',         require('./routes/note-routes'));

app.get('/api/health', (req, res) => res.json({ status: 'ZClean API running' }));

// Socket.io — real-time chat
// ── Socket authentication ────────────────────────────────────────────────────
// The websocket previously trusted whatever the client sent: `join` took a user
// id straight from the browser, so anyone could join another user's room and
// read their live messages, and `send_message` relayed a client-supplied object
// to any room, which allowed a forged message to appear in a client's chat as
// though the business had sent it.
//
// The handshake now carries the same JWT the REST API uses. Every room and
// every sender id is derived from that verified token, never from the payload,
// so the socket layer enforces exactly the identity the REST layer does.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required.'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Invalid or expired token.'));
  }
});

io.on('connection', (socket) => {
  // The room is the AUTHENTICATED user's own room. The client no longer gets a
  // say in which room it joins — the `join` event is kept only so existing
  // clients keep working, and its argument is deliberately ignored.
  const myRoom = `user_${socket.userId}`;
  socket.join(myRoom);
  socket.on('join', () => socket.join(myRoom));

  // Relay to the receiver and back to the sender. sender_id is overwritten with
  // the verified id so a client cannot claim to be someone else.
  socket.on('send_message', (msg) => {
    if (!msg?.receiver_id) return;
    const safe = { ...msg, sender_id: socket.userId };
    io.to(`user_${msg.receiver_id}`).emit('new_message', safe);
    io.to(myRoom).emit('new_message', safe);
  });

  // Typing indicator — relay-only, nothing persisted.
  socket.on('typing', ({ receiver_id, is_typing }) => {
    if (!receiver_id) return;
    io.to(`user_${receiver_id}`).emit('typing', { sender_id: socket.userId, is_typing });
  });

  // Read receipts — the reader tells the sender their messages were seen.
  socket.on('messages_read', ({ sender_id }) => {
    if (!sender_id) return;
    io.to(`user_${sender_id}`).emit('messages_read', { reader_id: socket.userId });
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ ZClean server running on port ${PORT}`);
  try {
    const { startReminderScheduler } = require('./utils/scheduler');
    startReminderScheduler();
  } catch (e) {
    console.warn('Scheduler not loaded:', e.message);
  }
});
