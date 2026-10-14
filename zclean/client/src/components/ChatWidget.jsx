import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, Maximize2, Image as ImageIcon } from 'lucide-react';
import { messagesAPI } from '../services/api.js';
import { playMessageSound } from '../utils/sound.js';
import { getSocket, connectSocket } from '../services/socket.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useLocation } from 'react-router-dom';


// ── Facebook-style floating chat for clients ─────────────────────────────────
// A round bubble bottom-right on every client page; opens a compact
// Messenger-sized panel (~340×480) with the same real-time chat, typing
// indicator, and unread badge as the full Messages page (which stays).
export default function ChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open,     setOpen]     = useState(false);
  const [adminId,  setAdminId]  = useState(null);
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [unread,   setUnread]   = useState(0);
  const [adminTyping, setAdminTyping] = useState(false);
  const bottomRef        = useRef(null);
  const lastTypingSent   = useRef(0);
  const stopTypingTimer  = useRef(null);
  const typingClearTimer = useRef(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgError,   setImgError]   = useState('');

  // Attachment picker. Validates before upload so the user gets an immediate,
  // specific reason rather than a failed request.
  const pickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';                 // allow re-picking the same file
    if (!f) return;
    setImgError('');
    if (!f.type.startsWith('image/')) return setImgError('Please choose an image file.');
    if (f.size > 5 * 1024 * 1024)      return setImgError('Image is too large (max 5MB).');
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };
  const clearImage = () => { setImgFile(null); setImgPreview(null); setImgError(''); };


  // Unread badge poll — same cadence as the rest of the app's badges.
  useEffect(() => {
    if (!user || user.role !== 'client') return;
    const load = () => messagesAPI.unreadCount().then(r => setUnread(r.data?.count || 0)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user]);

  // Resolve the admin and load history as soon as a client is signed in — the
  // live listener below depends on adminId, so gating this on `open` left the
  // widget deaf until the panel had been opened once.
  useEffect(() => {
    if (!user || user.role !== 'client' || adminId) return;
    messagesAPI.getAdminId().then(r => {
      const id = r.data?.admin_id;
      if (!id) return;
      setAdminId(id);
      return messagesAPI.get(id);
    }).then(r => { if (r) setMessages(r.data || []); }).catch(() => {});
  }, [user, adminId]);

  // Mobile browsers suspend sockets when the tab is backgrounded, so events
  // sent meanwhile are missed entirely. On return, re-sync history from the
  // database rather than trusting the in-memory list.
  useEffect(() => {
    if (!user || !adminId) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      messagesAPI.get(adminId).then(r => setMessages(r.data || [])).catch(() => {});
      messagesAPI.unreadCount().then(r => setUnread(r.data?.count || 0)).catch(() => {});
    };
    document.addEventListener('visibilitychange', resync);
    const sock = getSocket();
    sock.on('connect', resync);          // also after any reconnect
    return () => {
      document.removeEventListener('visibilitychange', resync);
      sock.off('connect', resync);
    };
  }, [user, adminId]);

  // Live socket: new messages + typing, mirroring ClientChat.
  useEffect(() => {
    if (!user || !adminId) return;
    const sock = connectSocket(user.id);
    if (!sock) return;

    const handle = (msg) => {
      const isOurs = (msg.sender_id === adminId && msg.receiver_id === user.id) ||
                     (msg.sender_id === user.id && msg.receiver_id === adminId);
      if (!isOurs) return;
      if (msg.sender_id === adminId) { setAdminTyping(false); playMessageSound(); }
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      if (msg.sender_id === adminId) {
        if (openRef.current) {
          messagesAPI.markRead(adminId).catch(() => {});
          getSocket().emit('messages_read', { reader_id: user.id, sender_id: adminId });
        }
        else setUnread(u => u + 1);
      }
    };
    const handleTyping = (t) => {
      if (t.sender_id !== adminId) return;
      setAdminTyping(!!t.is_typing);
      clearTimeout(typingClearTimer.current);
      if (t.is_typing) typingClearTimer.current = setTimeout(() => setAdminTyping(false), 4000);
    };
    // Admin read our messages — flip local copies so the ticks update live.
    const handleRead = ({ reader_id }) => {
      if (reader_id !== adminId) return;
      setMessages(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m));
    };
    sock.on('new_message', handle);
    sock.on('typing', handleTyping);
    sock.on('messages_read', handleRead);
    return () => { sock.off('new_message', handle); sock.off('typing', handleTyping); };
  }, [user, adminId]);

  // Track open state for the socket handler without re-binding it.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    if (open && adminId) {
      messagesAPI.markRead(adminId).catch(() => {});
      getSocket().emit('messages_read', { reader_id: user?.id, sender_id: adminId });
      setUnread(0);
    }
  }, [open, adminId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, adminTyping, open]);

  // Keyboard accessibility: Escape closes the panel (same convention as the
  // app's modals), matching the focus-visible standard the rest of the UI meets.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const emitTyping = () => {
    if (!adminId || !user) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 1200) {
      getSocket().emit('typing', { sender_id: user.id, receiver_id: adminId, is_typing: true });
      lastTypingSent.current = now;
    }
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      getSocket().emit('typing', { sender_id: user.id, receiver_id: adminId, is_typing: false });
      lastTypingSent.current = 0;
    }, 1500);
  };

  const sendMsg = async () => {
    const msg = text.trim();
    if ((!msg && !imgFile) || !adminId) return;
    setText('');
    const file = imgFile;
    clearImage();
    try {
      const payload = { receiver_id: adminId, booking_id: null, message: msg };
      const { data: newMsg } = file
        ? await messagesAPI.sendWithImage(payload, file)
        : await messagesAPI.send(payload);
      setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      getSocket().emit('send_message', newMsg);
    } catch { /* page toast systems not present here; message box keeps text loss minimal */ }
  };

  // Clients only; hidden on the full Messages page (it owns the screen there).
  if (!user || user.role !== 'client') return null;
  // useLocation (not window.location) so route changes actually re-render this
  // check — window.location is read outside React's knowledge and only worked
  // here by accident, because the parent Navbar re-renders on navigation.
  if (location.pathname === '/messages') return null;

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="chat-panel fixed z-50 flex flex-col overflow-hidden shadow-2xl anim-up-1"
          style={{ background: 'var(--surface)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ background: 'var(--brand)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 text-white text-sm font-bold flex items-center justify-center">Z</div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">Z's Cleaning</p>
                <p className="text-[10px] text-white/80 leading-tight">We usually reply within the day</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Hidden on mobile — the panel is already full-screen there */}
              <button onClick={() => { setOpen(false); window.location.href = '/messages'; }}
                aria-label="Open full messages page" title="Expand"
                className="hidden sm:block text-white/90 hover:text-white p-1">
                <Maximize2 size={15}/>
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-white/90 hover:text-white p-1">
                <X size={18}/>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ background: 'var(--bg)' }}>
            {messages.length === 0 && (
              <p className="text-xs text-center mt-6" style={{ color: 'var(--text-muted)' }}>
                Hi{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! How can we help you today?
              </p>
            )}
            {messages.map((m, idx) => {
              const mine = m.sender_id === user.id;
              const lastMine = mine && !messages.slice(idx + 1).some(x => x.sender_id === user.id);
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="text-sm max-w-[80%] whitespace-pre-wrap overflow-hidden"
                    style={mine
                      ? { background: 'var(--brand)', color: '#fff', borderRadius: '16px 16px 4px 16px' }
                      : { background: 'var(--surface)', color: 'var(--text-primary)', borderRadius: '16px 16px 16px 4px', border: '1px solid var(--border)' }}>
                    {m.image_url && (
                      <img src={m.image_url} alt="attachment"
                        onClick={() => window.open(m.image_url, '_blank')}
                        className="w-full max-h-52 object-cover cursor-pointer block"/>
                    )}
                    {m.message && <div className="px-3 py-2">{m.message}</div>}
                  </div>
                  {lastMine && (
                    <span className="text-[10px] mt-0.5 mr-1" style={{ color: 'var(--text-muted)' }}>
                      {m.is_read ? 'Seen' : 'Sent'}
                    </span>
                  )}
                </div>
              );
            })}
            {adminTyping && (
              <div className="flex justify-start">
                <div className="px-3 py-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px' }}>
                  <span className="typing-dots"><span/><span/><span/></span>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          {/* Pending attachment preview — shown above the composer so the user
              can confirm or remove it before sending. */}
          {(imgPreview || imgError) && (
            <div className="px-2.5 pt-2 shrink-0" style={{ background: 'var(--surface)' }}>
              {imgError && <p className="text-[11px] mb-1" style={{ color: '#dc2626' }}>{imgError}</p>}
              {imgPreview && (
                <div className="relative inline-block">
                  <img src={imgPreview} alt="preview" className="h-16 rounded-lg" style={{ border: '1px solid var(--border)' }}/>
                  <button onClick={clearImage} aria-label="Remove image"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#dc2626', color: '#fff' }}>
                    <X size={11}/>
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 px-2.5 py-2 shrink-0" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
            <label className="cursor-pointer shrink-0 p-1.5 rounded-full transition-colors hover:bg-black/5"
              aria-label="Attach image" title="Attach image" style={{ color: 'var(--text-muted)' }}>
              <ImageIcon size={18}/>
              <input type="file" accept="image/*" onChange={pickImage} className="hidden"/>
            </label>
            <input value={text} autoFocus
              onChange={e => { setText(e.target.value); emitTyping(); }}
              onKeyDown={e => e.key === 'Enter' && sendMsg()}
              placeholder="Type a message..."
              className="flex-1 text-[16px] sm:text-sm rounded-full px-3.5 py-2 outline-none"
              style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}/>
            <button onClick={sendMsg} disabled={!text.trim() && !imgFile}
              className="send-btn flex items-center justify-center rounded-full shrink-0 disabled:opacity-30"
              style={{ width: 36, height: 36, background: (text.trim() || imgFile) ? 'var(--brand)' : 'var(--surface2)', color: (text.trim() || imgFile) ? '#fff' : 'var(--text-muted)' }}>
              <Send size={15}/>
            </button>
          </div>
        </div>
      )}

      {/* Bubble */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open chat"
          className="fixed bottom-5 right-5 z-50 w-13 h-13 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-110"
          style={{ width: 52, height: 52, background: 'var(--brand)', color: '#fff' }}>
          <MessageCircle size={24}/>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center"
              style={{ background: '#dc2626', color: '#fff' }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    </>
  );
}
