import { useState, useEffect, useRef } from 'react';
import { Send, ChevronLeft, Image as ImageIcon, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { clientsAPI, messagesAPI } from '../../services/api.js';
import { playMessageSound } from '../../utils/sound.js';
import { getSocket, connectSocket } from '../../services/socket.js';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function AdminChat() {
  const { user }     = useAuth();
  const [clients,    setClients]   = useState([]);
  const [conversations, setConversations] = useState({}); // keyed by client id: { last_message, last_message_at, unread_count }
  const [selected,   setSelected]  = useState(null); // selected client object
  const [messages,   setMessages]  = useState([]);
  const [text,       setText]      = useState('');
  const [loading,    setLoading]   = useState(true);
  const [msgLoading, setMsgLoading]= useState(false);
  const [search,     setSearch]    = useState('');
  const bottomRef    = useRef(null);

  // ── Typing indicator state (mirror of ClientChat) ──
  const [clientTyping, setClientTyping] = useState(false);
  const lastTypingSent   = useRef(0);
  const stopTypingTimer  = useRef(null);
  const typingClearTimer = useRef(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgError,   setImgError]   = useState('');

  // Attachment picker — validates client-side for immediate, specific feedback.
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
    if (!selected || !user) return;
    const now = Date.now();
    if (now - lastTypingSent.current > 1200) {
      getSocket().emit('typing', { sender_id: user.id, receiver_id: selected.id, is_typing: true });
      lastTypingSent.current = now;
    }
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => {
      getSocket().emit('typing', { sender_id: user.id, receiver_id: selected.id, is_typing: false });
      lastTypingSent.current = 0;
    }, 1500);
  };

  // Load client list
  useEffect(() => {
    clientsAPI.list().then(r => setClients(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Load conversation previews (last message + unread count) — separate, additive fetch
  const loadConversations = () => {
    messagesAPI.listConversations().then(r => setConversations(r.data || {})).catch(() => {});
  };
  useEffect(() => { loadConversations(); }, []);

  // Socket setup
  useEffect(() => {
    if (!user) return;
    const sock = connectSocket(user.id);
    if (!sock) return;
    // Join unconditionally: the socket may already be connected (the floating
    // chat widget opens it on page load), in which case a guarded join would
    // never run and no typing/message events would reach this page.

    const handle = (msg) => {
      if (!selected) return;
      const isOurs = (msg.sender_id === user.id && msg.receiver_id === selected.id) ||
                     (msg.sender_id === selected.id && msg.receiver_id === user.id);
      if (!isOurs) return;
      if (msg.sender_id === selected.id) { setClientTyping(false); playMessageSound(); }
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      loadConversations(); // keep contact list preview in sync
    };
    // Only show typing for the currently selected client; 4s self-healing timeout.
    const handleTyping = (t) => {
      if (!selected || t.sender_id !== selected.id) return;
      setClientTyping(!!t.is_typing);
      clearTimeout(typingClearTimer.current);
      if (t.is_typing) typingClearTimer.current = setTimeout(() => setClientTyping(false), 4000);
    };
    const handleRead = ({ reader_id }) => {
      if (!selected || reader_id !== selected.id) return;
      setMessages(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m));
    };
    sock.on('new_message', handle);
    sock.on('typing', handleTyping);
    sock.on('messages_read', handleRead);
    return () => { sock.off('new_message', handle); sock.off('typing', handleTyping); };
  }, [user, selected]);

  // Load messages when client selected
  useEffect(() => {
    if (!selected) return;
    setClientTyping(false); // reset indicator when switching conversations
    setMsgLoading(true);
    messagesAPI.get(selected.id).then(r => setMessages(r.data || [])).catch(() => {}).finally(() => setMsgLoading(false));
    messagesAPI.markRead(selected.id).catch(() => {}).finally(() => loadConversations());
    getSocket().emit('messages_read', { reader_id: user.id, sender_id: selected.id });
  }, [selected]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, clientTyping]);

  // Re-sync after backgrounding / reconnect — see ClientChat for rationale.
  useEffect(() => {
    if (!user || !selected) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      messagesAPI.get(selected.id).then(r => setMessages(r.data || [])).catch(() => {});
      loadConversations();
    };
    document.addEventListener('visibilitychange', resync);
    const sock = getSocket();
    sock.on('connect', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      sock.off('connect', resync);
    };
  }, [user, selected]);

  const sendMsg = async () => {
    const msg = text.trim();
    if ((!msg && !imgFile) || !selected) return;
    setText('');
    const file = imgFile;
    clearImage();
    try {
      const payload = { receiver_id: selected.id, booking_id: null, message: msg };
      const { data: newMsg } = file
        ? await messagesAPI.sendWithImage(payload, file)
        : await messagesAPI.send(payload);
      getSocket().emit('send_message', newMsg);
    } catch { setText(msg); }
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };

  // Id of the newest message the admin sent — only that one shows Sent/Seen.
  const lastSentId = [...messages].reverse().find(m => m.sender_id === user?.id)?.id;

  const fmtTime = d => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = d => {
    const dt = new Date(d), today = new Date(), yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    if (dt.toDateString() === today.toDateString()) return 'Today';
    if (dt.toDateString() === yest.toDateString()) return 'Yesterday';
    return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  const grouped = messages.reduce((acc, m) => {
    const k = fmtDate(m.created_at);
    if (!acc[k]) acc[k] = [];
    acc[k].push(m);
    return acc;
  }, {});

  // Sort by most recent message first — contacts with no conversation yet
  // (no last_message_at) fall to the bottom, alphabetically among themselves.
  const filtered = clients
    .filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aTime = conversations[a.id]?.last_message_at;
      const bTime = conversations[b.id]?.last_message_at;
      if (!aTime && !bTime) return (a.name || '').localeCompare(b.name || '');
      if (!aTime) return 1;
      if (!bTime) return -1;
      return new Date(bTime) - new Date(aTime);
    });

  return (
    <AdminLayout title="Messages">
      <div className="flex rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 140px)', border: '1px solid var(--border)' }}>

        {/* ── Contact List ── */}
        {/* Mobile: full-width, hidden once a conversation is selected (back button reveals it again).
            Desktop (lg+): always visible at fixed width alongside the conversation panel. */}
        <div className={`${selected ? 'hidden lg:flex' : 'flex'} w-full lg:w-72 shrink-0 flex-col`}
          style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <input className="input text-sm" placeholder="Search clients…"
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>No clients yet.</p>
            )}
            {filtered.map(c => {
              const conv = conversations[c.id];
              return (
                <button key={c.id} onClick={() => setSelected(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface2)]"
                  style={{ background: selected?.id === c.id ? 'var(--brand-pale)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-full text-white font-bold flex items-center justify-center text-sm shrink-0" style={{ background: 'var(--brand)' }}>
                    {c.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: selected?.id === c.id ? 'var(--brand)' : 'var(--text-primary)' }}>{c.name}</p>
                      {conv?.last_message_at && (
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {new Date(conv.last_message_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {conv?.last_message
                          ? (conv.last_image_url
                              ? <span className="inline-flex items-center gap-1"><ImageIcon size={11}/>{conv.last_message}</span>
                              : conv.last_message)
                          : conv?.last_image_url
                            ? <span className="inline-flex items-center gap-1">
                                <ImageIcon size={11}/>
                                {conv.last_sender_id === user?.id ? 'You sent a photo' : `${c.name?.split(' ')[0] || 'Client'} sent a photo`}
                              </span>
                            : c.email}
                      </p>
                      {conv?.unread_count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Conversation ── */}
        {!selected ? (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'var(--surface2)' }}>
              <Send size={24} style={{ color: 'var(--text-muted)' }}/>
            </div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Select a client to start messaging</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Messages appear here.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col" style={{ background: 'var(--bg)' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setSelected(null)} className="lg:hidden p-1" aria-label="Back to contacts" style={{ color: 'var(--text-muted)' }}>
                <ChevronLeft size={18}/>
              </button>
              <div className="w-9 h-9 rounded-full text-white font-bold flex items-center justify-center text-sm shrink-0" style={{ background: 'var(--brand)' }}>
                {selected.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{selected.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{selected.email}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {msgLoading && <p className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>}
              {!msgLoading && messages.length === 0 && (
                <p className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>No messages yet. Say hello!</p>
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
                            style={{ background: 'var(--brand)', opacity: showAvatar ? 1 : 0 }}>
                            {selected.name?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className={`flex flex-col max-w-[65%] ${mine ? 'items-end' : 'items-start'}`}>
                          <div className="px-4 py-2.5 text-sm leading-relaxed"
                            style={{
                              background: mine ? 'var(--brand)' : 'var(--surface)',
                              color: mine ? 'white' : 'var(--text-primary)',
                              borderRadius: mine ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)', wordBreak: 'break-word',
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
              {/* Typing indicator — mirrors the client bubble style */}
              {clientTyping && (
                <div className="flex items-end gap-2 mb-1 justify-start">
                  <div className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0 mb-0.5" style={{ background: 'var(--brand)' }}>
                    {selected.name?.[0]?.toUpperCase()}
                  </div>
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
              <textarea rows={1}
                className="flex-1 resize-none text-sm rounded-2xl px-4 py-2.5 outline-none"
                style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', maxHeight: 100 }}
                placeholder="Aa" value={text}
                onChange={e => { setText(e.target.value); emitTyping(); }} onKeyDown={handleKey}/>
              <button onClick={sendMsg} disabled={!text.trim() && !imgFile}
                className="send-btn flex items-center justify-center rounded-full transition-all disabled:opacity-30 shrink-0"
                style={{ width: 40, height: 40, background: (text.trim() || imgFile) ? 'var(--brand)' : 'var(--surface2)', color: (text.trim() || imgFile) ? 'white' : 'var(--text-muted)' }}>
                <Send size={16}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
