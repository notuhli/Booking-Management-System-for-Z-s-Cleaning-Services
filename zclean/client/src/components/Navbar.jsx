import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun, Menu, X, LogOut, User, Calendar, Home, MessageCircle, ChevronUp, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDarkMode } from '../hooks/useDarkMode.jsx';
import ZCleanLogo from './ZCleanLogo.jsx';
import NotificationBell from './NotificationBell.jsx';
import ChatWidget from './ChatWidget.jsx';
import { messagesAPI } from '../services/api.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  useEffect(() => {
    if (!user) return;
    const load = () => messagesAPI.unreadCount().then(r => setMsgUnread(r.data?.count || 0)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [user]);
  const [dark, setDark]  = useDarkMode();
  const [open, setOpen]  = useState(false);
  const navigate         = useNavigate();
  const location         = useLocation();

  // Homepage navbar is a consistent dark brand-green glass at EVERY scroll
  // position — it blends over the dark hero and reads as a brand band over
  // the light sections, so the bar never "flips" from white-on-dark to
  // dark-on-light mid-scroll. showGlass (white text mode) is simply isHome.
  const isHome = location.pathname === '/';
  const showGlass = isHome;

  // Active page indicator: the current page's nav link is brand-colored and
  // bolder. On the dark-glass homepage bar the active color is the bright
  // Caribbean green (deep brand green would vanish on the dark backdrop).
  const linkStyle = (path) => location.pathname === path
    ? { color: showGlass ? '#00DF81' : 'var(--brand)', fontWeight: 700 }
    : { color: showGlass ? '#ffffff' : 'var(--text-secondary)' };
  // Mobile menu always sits on a light/dark surface (never glass), so active
  // gets brand color + a pale chip.
  const mobileLinkStyle = (path) => location.pathname === path
    ? { color: 'var(--brand)', fontWeight: 700, background: 'var(--brand-pale)' }
    : { color: 'var(--text-secondary)' };

  // Scroll progress: 0–100% of the page scrolled, rendered as a thin bar at
  // the very top of the navbar. Passive listener; recomputed per route since
  // page heights differ.
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min((window.scrollY / max) * 100, 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <>
    <nav className={showGlass ? "nav-dark-glass fixed top-0 left-0 right-0 z-40 border-b transition-all duration-300" : "sticky top-0 z-40 border-b transition-all duration-300 nav-glass"}
      style={showGlass
        ? { background: 'linear-gradient(180deg, rgba(3,50,44,0.85) 0%, rgba(3,34,33,0.75) 100%)', borderColor: 'rgba(255,255,255,0.12)', borderBottomWidth: '1px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }
        : { borderColor: 'var(--brand-mid)', borderBottomWidth: '1.5px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      {/* Scroll progress — thin brand gradient tracking page position */}
      <div className="absolute top-0 left-0 h-[3px] pointer-events-none"
        style={{ width: `${scrollProgress}%`, background: 'linear-gradient(90deg, var(--brand), #2CC295)', transition: 'width 0.1s linear' }}/>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <ZCleanLogo size={30} />
          <span className="font-serif font-extrabold text-lg hidden sm:block transition-colors"
            style={{ color: showGlass ? '#ffffff' : 'var(--text-primary)' }}>
            Z's Cleaning Services
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-2">
          <Link to="/" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={linkStyle('/')}>
            <Home size={15} /> Home
          </Link>
          {/* Public — shown to guests too, so prospective clients can read
              about the business before deciding to register. */}
          <Link to="/about" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={linkStyle('/about')}>
            <Info size={15} /> About
          </Link>
          {user?.role === 'client' && (
            <>
              <Link to="/book" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={linkStyle('/book')}>
                Book Now
              </Link>
              <Link to="/my-bookings" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={linkStyle('/my-bookings')}>
                <Calendar size={15} /> My Bookings
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/admin" className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: showGlass ? 'rgba(255,255,255,0.15)' : 'var(--brand-pale)', color: showGlass ? '#ffffff' : 'var(--brand)' }}>
              Dashboard
            </Link>
          )}

          <button onClick={() => setDark(d => !d)} className="p-2 rounded-lg transition-colors flex items-center justify-center"
            style={{ color: showGlass ? '#ffffff' : 'var(--text-muted)' }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {user && user.role === 'client' && <NotificationBell />}

          {user ? (
            <div className="flex items-center gap-2 ml-1">
              <Link to="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={{
                  color: showGlass ? '#ffffff' : 'var(--text-primary)',
                  background: showGlass ? 'rgba(255,255,255,0.12)' : 'var(--surface2)',
                  border: showGlass ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border)',
                }}>
                <User size={14} /> {user.name?.split(' ')[0]}
              </Link>
              <button onClick={handleLogout} className="p-2 rounded-lg transition-colors"
                style={{ color: showGlass ? '#ffffff' : 'var(--text-muted)' }}>
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-1">
              <Link to="/login"    className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ color: showGlass ? '#ffffff' : 'var(--text-secondary)' }}>Sign In</Link>
              <Link to="/register" className="btn-primary !py-2 !px-4 !text-sm">Register</Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 sm:hidden">
          <button onClick={() => setDark(d => !d)} className="p-2" aria-label="Toggle dark mode" style={{ color: showGlass ? '#ffffff' : 'var(--text-muted)' }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user && user.role === 'client' && <NotificationBell />}
          <button onClick={() => setOpen(v => !v)} aria-label="Toggle menu" style={{ color: showGlass ? '#ffffff' : 'var(--text-primary)' }}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t px-4 py-3 space-y-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Link to="/" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={mobileLinkStyle('/')}>Home</Link>
          <Link to="/about" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={mobileLinkStyle('/about')}>About</Link>
          {user?.role === 'client' && (
            <>
              <Link to="/book"         onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={mobileLinkStyle('/book')}>Book Now</Link>
              <Link to="/my-bookings"  onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={mobileLinkStyle('/my-bookings')}>My Bookings</Link>
              <Link to="/profile"      onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={mobileLinkStyle('/profile')}>Profile</Link>
            </>
          )}
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--brand)' }}>Admin Dashboard</Link>
          )}
          {user ? (
            <button onClick={() => { handleLogout(); setOpen(false); }} className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-500">
              Logout
            </button>
          ) : (
            <div className="flex gap-2 pt-2">
              <Link to="/login"    onClick={() => setOpen(false)} className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-semibold" style={{ border: '1.5px solid var(--border)', color: 'var(--text-secondary)' }}>Sign In</Link>
              <Link to="/register" onClick={() => setOpen(false)} className="btn-primary flex-1 justify-center !py-2 !text-sm">Register</Link>
            </div>
          )}
        </div>
      )}
    </nav>

    {/* Scroll to top — outside <nav> because its backdrop-filter would trap
        position:fixed children. Reuses scrollProgress; appears after ~8% of
        the page is scrolled. */}
    {scrollProgress > 8 && (
      <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
        className={`fixed ${user?.role === 'client' ? 'bottom-[4.75rem]' : 'bottom-5'} right-5 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 group`}
        style={{
          /* Bright Caribbean green on a dark core, with a conic-gradient ring
             showing how far down the page you are — the button is now easy to
             spot AND tells you something the plain arrow didn't. */
          background: `conic-gradient(#00DF81 ${scrollProgress * 3.6}deg, rgba(255,255,255,0.18) 0deg)`,
          boxShadow: '0 6px 20px rgba(0,0,0,0.28), 0 0 18px rgba(0,223,129,0.35)',
        }}>
        {/* The core must stay dark in BOTH themes so the green arrow reads.
            (It previously used --brand-dark, which is a HOVER token: #032221 in
            light mode but #2CC295 in dark — a light green, leaving a green
            arrow on a green disc.) Literal value, not a token, because the
            requirement here is "always dark", not "follows the theme". */}
        <span className="flex items-center justify-center rounded-full"
          style={{ width: 40, height: 40, background: '#032221' }}>
          <ChevronUp size={20} style={{ color: '#00DF81' }}/>
        </span>
      </button>
    )}

    {/* Facebook-style floating chat — clients only, hidden on /messages */}
    <ChatWidget/>
    </>
  );
}
