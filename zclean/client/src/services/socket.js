import { io } from 'socket.io-client';

// ── One socket for the whole app ─────────────────────────────────────────────
// Previously ChatWidget, ClientChat and AdminChat each declared their own
// `let socket = null`, so each opened a SEPARATE connection. The server
// broadcasts to a per-user room, so every connection received the event — but
// each component only listened on its own instance. Combined with the widget
// only attaching its listener after the panel had been opened, messages could
// arrive with nothing listening, and only appeared after a refresh reloaded
// history from the database.
//
// This module owns the single connection. Every surface imports it, joins the
// same room, and shares the same event stream.

let socket = null;
let joinedUserId = null;

// The server now verifies a JWT during the websocket handshake, so the token
// has to travel with the connection the same way it travels with every REST
// call. It is read fresh each time (never captured once) because the value in
// localStorage changes across logout and login.
function authToken() {
  return localStorage.getItem('zclean_token') || '';
}

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      autoConnect: false,
      // Sent as the handshake `auth` payload; the server reads it from
      // socket.handshake.auth.token.
      auth: (cb) => cb({ token: authToken() }),
      // Mobile browsers suspend sockets when the tab is backgrounded; these
      // make the client come back on its own instead of sitting dead.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

// Connect (if needed) and join this user's room. Safe to call repeatedly —
// joining is idempotent server-side, and the room is re-joined automatically
// after any reconnect so a dropped connection heals itself.
export function connectSocket(userId) {
  if (!userId) return null;
  // Without a token the handshake would be rejected and socket.io would retry
  // for ever, so don't even start.
  if (!authToken()) return null;
  const sock = getSocket();
  joinedUserId = userId;
  if (!sock.connected) sock.connect();
  sock.emit('join', userId);
  if (!sock.__zcleanRejoinBound) {
    sock.on('connect', () => { if (joinedUserId) sock.emit('join', joinedUserId); });
    sock.__zcleanRejoinBound = true;
  }
  return sock;
}

export function disconnectSocket() {
  joinedUserId = null;
  if (socket?.connected) socket.disconnect();
}
