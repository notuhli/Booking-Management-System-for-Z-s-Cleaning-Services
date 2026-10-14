import { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, X} from 'lucide-react';
import Navbar from '../../components/Navbar.jsx';
import { messagesAPI } from '../../services/api.js';
import { playMessageSound } from '../../utils/sound.js';
import { getSocket, connectSocket } from '../../services/socket.js';
import { useAuth } from '../../hooks/useAuth.jsx';


export default function ClientChat() {
  const { user }     = useAuth();
  const [adminId,    setAdminId]  = useState(null);
  const [messages,   setMessages] = useState([]);
  const [text,       setText]     = useState('');
  const [loading,    setLoading]  = useState(true);
  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);

  // ── Typing indicator state ──
  // adminTyping: whether to show the "typing…" bubble (admin is typing to us).
  // lastTypingSent / stopTypingTimer: throttle our own outgoing 'typing' events
  // so we emit at most ~once per 1.2s while typing, then a stop after 1.5s idle.
  // typingClearTimer: safety — auto-hide the bubble after 4s in case the stop
  // event is ever lost (e.g., brief disconnect), so it can never get stuck on.
  const [adminTyping, setAdminTyping] = useState(false);
  const lastTypingSent   = useRef(0);
  const stopTypingTimer  = useRef(null);
  const typingClearTimer = useRef(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgError,   setImgError]   = useState('');

  // Attachment picker — validates client-side so the user gets an immediate,
  // specific reason instead of a failed upload.
  const pickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImgError('');
    if (!f.type.startsWith('image/')) return setImgError('Please choose an image file.');
    if (f.size > 5 * 1024 * 1024)      return setImgError('Image is too large (max 5MB).');
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };
  const clearImage = () => { setImgFile(null); setImgPreview(null); setImgError(''); };


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

  // Get admin ID then load messages
  useEffect(() => {
    messagesAPI.getAdminId().then(r => {
      const id = r.data?.admin_id;
      if (!id) { setLoading(false); return; }
      setAdminId(id);
      return messagesAPI.get(id);
    }).then(r => {
      if (r) setMessages(r.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Mark read when opened
  useEffect(() => {
    if (adminId) {
      messagesAPI.markRead(adminId).catch(() => {});
      getSocket().emit('messages_read', { reader_id: user.id, sender_id: adminId });
    }
  }, [adminId]);

  // Socket
  useEffect(() => {
    if (!user) return;
    const sock = connectSocket(user.id);
    if (!sock) return;
    // Join unconditionally: the socket may already be connected (the floating
    // chat widget opens it on page load), in which case a guarded join would
    // never run and no typing/message events would reach this page.

    const handle = (msg) => {
      const isOurs = (msg.sender_id === user.id && msg.receiver_id === adminId) ||
                     (msg.sender_id === adminId && msg.receiver_id === user.id);
      if (!isOurs) return;
      if (msg.sender_id === adminId) { setAdminTyping(false); playMessageSound(); }
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
    };
    // Typing events: only react to the admin's, with a 4s self-healing timeout.
    const handleTyping = (t) => {
      if (t.sender_id !== adminId) return;
      setAdminTyping(!!t.is_typing);
      clearTimeout(typingClearTimer.current);
      if (t.is_typing) typingClearTimer.current = setTimeout(() => setAdminTyping(false), 4000);
    };
    const handleRead = ({ reader_id }) => {
      if (reader_id !== adminId) return;
      setMessages(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m));
    };
    sock.on('new_message', handle);
    sock.on('typing', handleTyping);
    sock.on('messages_read', handleRead);
    return () => { sock.off('new_message', handle); sock.off('typing', handleTyping); };
  }, [user, adminId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, adminTyping]);

  // Re-sync after the tab was backgrounded or the socket reconnected: events
  // sent while suspended never arrived, so trust the database, not memory.
  useEffect(() => {
    if (!user || !adminId) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      messagesAPI.get(adminId).then(r => setMessages(r.data || [])).catch(() => {});
    };
    document.addEventListener('visibilitychange', resync);
    const sock = getSocket();
    sock.on('connect', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      sock.off('connect', resync);
    };
  }, [user, adminId]);

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
      getSocket().emit('send_message', newMsg);
    } catch { setText(msg); }
  };

  // Id of the newest message WE sent — only that one shows Sent/Seen, the
  // Messenger convention (per-bubble ticks are noise).
  const lastSentId = [...messages].reverse().find(m => m.sender_id === user?.id)?.id;

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

  const fmtTime = d => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = d => {
    const dt = new Date(d), today = new Date(), yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    if (dt.toDateString() === today.toDateString()) return 'Today';
    if (dt.toDateString() === yest.toDateString()) return 'Yesterday';
    return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group by date
  const grouped = messages.reduce((acc, m) => {
    const k = fmtDate(m.created_at);
    if (!acc[k]) acc[k] = [];
    acc[k].push(m);
    return acc;
  }, {});

  return (
    <>
      <Navbar />
      <div className="flex flex-col chat-viewport" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-full text-white font-bold flex items-center justify-center text-sm" style={{ background: 'var(--brand)' }}>Z</div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Z's Cleaning Services</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Calbayog City · 0916-213-3460</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: 'var(--bg)' }}>
          {loading && <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && messages.length === 0 && (
            <div className="flex items-end gap-2 mb-1 justify-start">
              <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'var(--brand)' }}>Z</div>
              <div className="flex flex-col items-start max-w-[80%] sm:max-w-[70%]">
                <div className="px-4 py-2.5 text-sm leading-relaxed"
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    borderRadius: '20px 20px 20px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }}>
                  Hi! 👋 Got a question about your booking, schedule, or our services? Send us a message anytime — we usually reply within the day.
                </div>
                <span className="text-[10px] mt-0.5 px-1" style={{ color: 'var(--text-muted)' }}>Z's Cleaning Services</span>
              </div>
            </div>
          )}
          {Object.entries(grouped).map(([dateLabel, msgs]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-2 my-4">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
                <span className="text-[11px] px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>{dateLabel}</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }}/>
              </div>
              {msgs.map((m, i) => {
                const mine = m.sender_id === user?.id;
                const prev = msgs[i-1];
                const showAvatar = !mine && (!prev || prev.sender_id !== m.sender_id);
                return (
                  <div key={m.id || i} className={`flex items-end gap-2 mb-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {!mine && (
                      <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 mb-0.5"
                        style={{ background: 'var(--brand)', opacity: showAvatar ? 1 : 0 }}>Z</div>
                    )}
                    <div className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
                      <div className="px-4 py-2.5 text-sm leading-relaxed"
                        style={{
                          background: mine ? 'var(--brand)' : 'var(--surface)',
                          color: mine ? 'white' : 'var(--text-primary)',
                          borderRadius: mine ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                          wordBreak: 'break-word',
                        }}>
                          {m.image_url && (
                            <img src={m.image_url} alt="attachment"
                              onClick={() => window.open(m.image_url, '_blank')}
                              className="rounded-xl mb-1 max-h-60 object-cover cursor-pointer block"
                              style={{ maxWidth: '100%' }}/>
                          )}
                          {m.message}
                        </div>
                      <span className="text-[10px] mt-0.5 px-1" style={{ color: 'var(--text-muted)' }}>
                        {fmtTime(m.created_at)}
                        {m.id === lastSentId && ` · ${m.is_read ? 'Seen' : 'Sent'}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {/* Typing indicator — mirrors the admin bubble style */}
          {adminTyping && (
            <div className="flex items-end gap-2 mb-1 justify-start">
              <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'var(--brand)' }}>Z</div>
              <div className="px-4 py-3"
                style={{ background: 'var(--surface)', borderRadius: '20px 20px 20px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                <span className="typing-dots"><span/><span/><span/></span>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Pending attachment preview */}
        {(imgPreview || imgError) && (
          <div className="px-4 pt-2 shrink-0" style={{ background: 'var(--surface)' }}>
            {imgError && <p className="text-xs mb-1" style={{ color: '#dc2626' }}>{imgError}</p>}
            {imgPreview && (
              <div className="relative inline-block">
                <img src={imgPreview} alt="preview" className="h-20 rounded-lg" style={{ border: '1px solid var(--border)' }}/>
                <button onClick={clearImage} aria-label="Remove image"
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: '#dc2626', color: '#fff' }}>
                  <X size={12}/>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex items-end gap-2 px-4 py-3 shrink-0"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <label className="cursor-pointer shrink-0 p-2 rounded-full transition-colors hover:bg-black/5"
            aria-label="Attach image" title="Attach image" style={{ color: 'var(--text-muted)' }}>
            <ImageIcon size={20}/>
            <input type="file" accept="image/*" onChange={pickImage} className="hidden"/>
          </label>
          <textarea ref={inputRef} rows={1}
            className="flex-1 resize-none text-[16px] sm:text-sm rounded-2xl px-4 py-2.5 outline-none"
            style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', maxHeight: 100 }}
            placeholder="Aa" value={text}
            onChange={e => { setText(e.target.value); emitTyping(); }} onKeyDown={handleKey}/>
          <button onClick={sendMsg} disabled={(!text.trim() && !imgFile) || !adminId}
            className="send-btn flex items-center justify-center rounded-full transition-all disabled:opacity-30 shrink-0"
            style={{ width: 40, height: 40, background: (text.trim() || imgFile) ? 'var(--brand)' : 'var(--surface2)', color: (text.trim() || imgFile) ? 'white' : 'var(--text-muted)' }}>
            <Send size={16}/>
          </button>
        </div>
      </div>
    </>
  );
}
