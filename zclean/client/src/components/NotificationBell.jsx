import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { notificationsAPI } from '../services/api.js';
import { playNotifySound } from '../utils/sound.js';

export default function NotificationBell() {
  const [notifs,  setNotifs]  = useState([]);
  const [open,    setOpen]    = useState(false);
  const ref = useRef(null);

  const load = () => notificationsAPI.get().then(r => setNotifs(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const unread = notifs.filter(n => !n.is_read).length;

  // Sound only when the unread count RISES while the page is open. Comparing
  // against the previous value (rather than "unread > 0") is what stops every
  // page load from chiming for notifications that were already waiting.
  // prevUnread starts as null so the first poll establishes a baseline
  // silently instead of counting as an arrival.
  const prevUnread = useRef(null);
  useEffect(() => {
    if (prevUnread.current !== null && unread > prevUnread.current) playNotifySound();
    prevUnread.current = unread;
  }, [unread]);

  const markRead = async (id) => {
    await notificationsAPI.markRead(id).catch(() => {});
    setNotifs(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAll = async () => {
    await notificationsAPI.markAll().catch(() => {});
    setNotifs(p => p.map(n => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      {/* flex-centred rather than relying on inline baseline: the icon is
          wrapped in a span for the ring animation, and an inline-flex span
          sits on the text baseline — which lifted the bell above the other
          navbar icons, whose SVGs are direct children. */}
      <button onClick={() => setOpen(v => !v)}
        className="bell-btn relative p-2 rounded-lg transition-colors flex items-center justify-center"
        style={{ color: 'var(--text-secondary)' }}>
        <span key={unread} className={unread > 0 ? 'bell-ring' : 'inline-flex'}>
          <Bell size={16} />
        </span>
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 z-50 shadow-2xl rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={28} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>You're all caught up!</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Booking updates will appear here.</p>
              </div>
            ) : notifs.map(n => (
              <div key={n.id}
                className="px-4 py-3 cursor-pointer transition-colors"
                style={{ background: n.is_read ? 'transparent' : 'var(--brand-pale)', borderBottom: '1px solid var(--border)' }}
                onClick={() => markRead(n.id)}>
                <p className="text-sm" style={{ color: 'var(--text-primary)', fontWeight: n.is_read ? 400 : 600 }}>
                  {n.message}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {new Date(n.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
