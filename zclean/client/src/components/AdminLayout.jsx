import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, Settings, Users, Star,
  BarChart2, LogOut, Moon, Sun, Menu, X, MessageCircle, Pin, PinOff
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDarkMode } from '../hooks/useDarkMode.jsx';
import ZCleanLogo from './ZCleanLogo.jsx';
import { messagesAPI, bookingsAPI, reviewsAPI } from '../services/api.js';

const NAV = [
  { to: '/admin',           icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/admin/bookings',  icon: CalendarDays,    label: 'Bookings'   },
  { to: '/admin/services',  icon: Settings,        label: 'Services'   },
  { to: '/admin/clients',   icon: Users,           label: 'Clients'    },
  { to: '/admin/reviews',   icon: Star,            label: 'Reviews'    },
  { to: '/admin/chat',      icon: MessageCircle,   label: 'Messages'   },
  { to: '/admin/reports',   icon: BarChart2,       label: 'Reports'    },
];

export default function AdminLayout({ children, title }) {
  const [msgUnread,    setMsgUnread]    = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewCount,  setReviewCount]  = useState(0);
  useEffect(() => {
    const load = () => {
      messagesAPI.unreadCount().then(r => setMsgUnread(r.data?.count || 0)).catch(() => {});
      // Pending bookings needing action, and reviews awaiting an admin reply —
      // same silent-fail polling pattern as the messages badge above.
      bookingsAPI.getAll().then(r => setPendingCount((r.data || []).filter(b => b.status === 'pending').length)).catch(() => {});
      reviewsAPI.all().then(r => setReviewCount((r.data || []).filter(v => !v.reply).length)).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  // Which count belongs to which nav item
  const badgeFor = (to) =>
    to === '/admin/chat'     ? msgUnread    :
    to === '/admin/bookings' ? pendingCount :
    to === '/admin/reviews'  ? reviewCount  : 0;
  const { logout }      = useAuth();
  const [dark, setDark] = useDarkMode();
  const [mobile, setMobile] = useState(false);
  // Sidebar pin — the rail expands on hover, which means labels are hidden by
  // default and it expands accidentally whenever the cursor crosses it. Pinning
  // locks it open; the choice is remembered so a desktop user isn't re-pinning
  // on every visit. Unpinned keeps the original hover behaviour.
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem('zclean_sidebar_pinned') === '1'; } catch { return false; }
  });
  const togglePin = () => setPinned(p => {
    const next = !p;
    try { localStorage.setItem('zclean_sidebar_pinned', next ? '1' : '0'); } catch {}
    return next;
  });
  const { pathname }    = useLocation();
  const navigate        = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const NavItem = ({ to, icon: Icon, label, onClick, badgeCount }) => {
    const active = pathname === to;
    const [hovered, setHovered] = useState(false);
    return (
      // `title` gives a native tooltip so the collapsed rail is identifiable
      // without expanding the whole sidebar just to read one icon.
      <Link to={to} onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={label}
        aria-current={active ? 'page' : undefined}
        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl relative"
        style={{
          background: active ? 'var(--sidebar-active-bg)' : hovered ? 'var(--sidebar-hover-bg)' : 'transparent',
          color:      active ? 'var(--sidebar-brand)' : hovered ? 'var(--sidebar-text-hover)' : 'var(--sidebar-text)',
          transition: 'background-color 0.2s ease, color 0.2s ease',
        }}>
        <span className="shrink-0 flex items-center justify-center rounded-lg relative"
          style={{
            width: 30, height: 30,
            background: active ? 'var(--sidebar-active-bg)' : 'transparent',
            transition: 'background-color 0.2s ease',
          }}>
          {/* Icon rings when there's something needing attention — same
              animation as the client notification bell, re-triggered whenever
              the count changes (keyed span remounts and replays it) */}
          <span key={badgeCount} className={badgeCount > 0 ? 'bell-ring' : 'inline-flex'}>
            <Icon size={18} style={{ transition: 'transform 0.2s ease', transform: hovered ? 'scale(1.12)' : 'scale(1)' }} />
          </span>
          {/* Unread badge — now has genuine room to sit outside the icon pill
              since the collapsed sidebar itself was widened to 72px (was 60px),
              rather than continuing to shrink the icon/badge to fit a too-tight
              container. */}
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center pointer-events-none">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </span>
        <span className="text-sm font-semibold whitespace-nowrap overflow-hidden transition-all duration-200 sidebar-label">
          {label}
        </span>
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
            style={{ width: 3, height: 20, background: 'var(--sidebar-brand)' }} />
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Desktop Sidebar — collapsed width widened from 60px to 72px so the
          unread badge has real margin to sit outside the icon pill without
          touching the sidebar's edge (shrinking the icon/badge further wasn't
          enough; the container itself needed a bit more room). */}
      <aside className={`hidden md:flex flex-col group/sidebar transition-all duration-200 ${pinned ? 'sidebar-pinned' : ''}`}
        style={{
          width: pinned ? 220 : 72,
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
          position: 'sticky', top: 0, height: '100vh',
        }}
        onMouseEnter={e => { if (!pinned) e.currentTarget.style.width = '220px'; }}
        onMouseLeave={e => { if (!pinned) e.currentTarget.style.width = '72px'; }}
      >
        {/* Logo — padding chain matches a NavItem (container px-2 + px-3, 30px
            box) so the mark sits on the same vertical axis as every icon below
            it, and the wordmark starts at the same x as the nav labels. */}
        <div className="flex items-center gap-3 px-2 py-4 overflow-hidden" style={{ minHeight: 60 }}>
          <div className="shrink-0 pl-3">
            {/* 36px mark centred inside the 30px nav axis box: bigger presence
                without breaking alignment with the icons below. */}
            <div className="flex items-center justify-center" style={{ width: 30 }}>
              <ZCleanLogo size={36} />
            </div>
          </div>
          <div className="overflow-hidden whitespace-nowrap sidebar-label transition-all duration-200 opacity-0 group-hover/sidebar:opacity-100">
            <p className="font-black text-sm uppercase tracking-tight leading-tight" style={{ color: 'var(--sidebar-wordmark)' }}>Z's Cleaning</p>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--sidebar-brand)' }}>Admin</p>
          </div>
        </div>

        <div className="flex-1 px-2 py-2 space-y-0.5 overflow-hidden">
          {NAV.map(n => (
          <div key={n.to} className="relative">
            <NavItem {...n} badgeCount={badgeFor(n.to)} />
          </div>
        ))}
        </div>


        <div className="px-2 py-3 space-y-0.5 overflow-hidden" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <button onClick={togglePin}
            title={pinned ? 'Unpin sidebar' : 'Keep sidebar open'}
            aria-pressed={pinned}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all sidebar-btn"
            style={{ color: pinned ? 'var(--sidebar-brand)' : 'var(--sidebar-text)' }}>
            {pinned ? <PinOff size={18} className="shrink-0" /> : <Pin size={18} className="shrink-0" />}
            <span className="text-xs font-semibold whitespace-nowrap overflow-hidden sidebar-label opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
              {pinned ? 'Unpin Sidebar' : 'Keep Sidebar Open'}
            </span>
          </button>
          <button onClick={() => setDark(d => !d)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all sidebar-btn"
            style={{ color: 'var(--sidebar-text)' }}>
            {dark ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
            <span className="text-xs font-semibold whitespace-nowrap overflow-hidden sidebar-label opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
              {dark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
            style={{ color: 'rgba(255,100,100,0.7)' }}>
            <LogOut size={18} className="shrink-0" />
            <span className="text-xs font-semibold whitespace-nowrap overflow-hidden sidebar-label opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
              Log out
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobile && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 flex flex-col" style={{ background: 'var(--sidebar-bg)' }}>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-3">
                <ZCleanLogo size={30} />
                <p className="font-bold text-sm" style={{ color: 'var(--sidebar-wordmark)' }}>ZClean Admin</p>
              </div>
              <button onClick={() => setMobile(false)} style={{ color: 'var(--sidebar-text-hover)' }} aria-label="Close menu"><X size={20} /></button>
            </div>
            <div className="flex-1 px-3 space-y-0.5">
              {NAV.map(n => (
              <div key={n.to} className="relative">
                <NavItem {...n} onClick={() => setMobile(false)} badgeCount={badgeFor(n.to)} />
              </div>
            ))}
            </div>
            <div className="px-3 py-4">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ color: 'rgba(255,100,100,0.7)' }}>
                <LogOut size={18} /> <span className="text-sm font-semibold text-red-400">Log out</span>
              </button>
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobile(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="nav-glass sticky top-0 z-30 flex items-center justify-between px-4 h-14"
          style={{ borderBottom: '1px solid var(--border)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setMobile(true)} aria-label="Open menu" style={{ color: 'var(--text-primary)' }}>
              <Menu size={22} />
            </button>
            <h1 className="font-serif font-bold text-xl" style={{ color: 'var(--text-primary)' }}>{title}</h1>
          </div>
          <button onClick={() => setDark(d => !d)} className="p-2 rounded-lg" aria-label="Toggle dark mode" style={{ color: 'var(--text-muted)' }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
