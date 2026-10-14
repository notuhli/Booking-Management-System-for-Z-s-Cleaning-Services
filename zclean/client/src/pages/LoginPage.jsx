import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, Sparkles } from 'lucide-react';
import ZCleanLogo from '../components/ZCleanLogo.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../services/api.js';

const SLIDES = [
  '/staff/staff-2.jpg',
  '/staff/staff-4.jpg',
  '/staff/staff-3.jpg',
  '/staff/staff-7.jpg',
  '/staff/staff-8.jpg',
  '/staff/staff-9.jpg',
];

export default function LoginPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  // ── Remembering the email ──────────────────────────────────────────────
  // The address of whoever signed in last on THIS device is kept, so a
  // returning client only types their password — the slowest part on a phone.
  // Only the email is ever stored: the password is never written anywhere, and
  // the field stays editable so somebody else can simply type over it.
  const LAST_EMAIL_KEY = 'zclean_last_email';
  const rememberedEmail = (() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; }
  })();
  const [form,     setForm]    = useState({ email: rememberedEmail, password: '' });
  const [show,     setShow]    = useState(false);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const [slide,    setSlide]   = useState(0);
  const [fading,   setFading]  = useState(false);

  // Auto-advance slideshow every 4.5s with cross-fade
  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length);
        setFading(false);
      }, 600);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/login', form);
      // Saved only after a SUCCESSFUL sign-in, so a typo is never remembered.
      try { localStorage.setItem(LAST_EMAIL_KEY, form.email.trim()); } catch {}
      login(data.token, data.user);
      navigate(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally { setLoading(false); }
  };

  // Mobile keyboards animate in over ~300ms; once settled, bring the focused
  // field into view. dvh handles most cases, this covers browsers that don't.
  const keyboardSafeFocus = (e) => {
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  };

  return (
    <div className="auth-page auth-shell flex" style={{ background: 'var(--surface)' }}>

      {/* ── LEFT: Welcome panel with diagonal separator ──────────────────── */}
      <div className="auth-in-left hidden lg:block relative flex-1">
        {/* Accent layer — sits 4px left of the content layer so only a thin
            brand-green sliver shows along the diagonal: the separator. */}
        <div className="absolute inset-0"
          style={{ clipPath: 'polygon(0 0, 82% 0, 100% 100%, 0 100%)', background: 'var(--brand-bright)' }}/>
        {/* Content layer — same angle, nudged right. The clipped-away triangle
            reveals the page background, which matches the form side. */}
        <div className="absolute inset-0 overflow-hidden"
          style={{ clipPath: 'polygon(0 0, calc(82% - 4px) 0, calc(100% - 4px) 100%, 0 100%)' }}>
        {/* Photos stack — cross-fade via opacity */}
        {SLIDES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt="Z's Cleaning Services staff at work"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: i === slide ? (fading ? 0 : 1) : 0,
              transition: 'opacity 0.8s ease-in-out',
              zIndex: i === slide ? 1 : 0,
            }}
          />
        ))}

        {/* Dark gradient overlay — bottom-heavy so tagline is readable */}
        <div className="absolute inset-0 z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,15,15,0.85) 0%, rgba(0,15,15,0.35) 50%, rgba(0,15,15,0.15) 100%)' }}/>

        {/* Logo top-left */}
        <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
          <ZCleanLogo size={40} />
          <div>
            <p className="font-black text-white text-sm uppercase tracking-tight leading-none">Z's Cleaning</p>
            <p className="text-[10px] font-bold tracking-widest uppercase mt-0.5" style={{ color: '#00DF81' }}>Services</p>
          </div>
        </div>

        {/* Bottom tagline + bullets */}
        <div className="absolute bottom-10 left-8 right-[22%] z-20">
          <h2 className="font-serif font-bold text-3xl text-white leading-snug mb-4">
            Your clean home<br />starts here.
          </h2>
          <div className="space-y-2 mb-6">
            {[
              'Professional cleaners, Calbayog City',
              'Book in minutes, clean in hours',
              'GCash & cash payments accepted',
            ].map(t => (
              <div key={t} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: '#00DF81' }}>
                  <Sparkles size={10} color="white" />
                </div>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{t}</p>
              </div>
            ))}
          </div>

          {/* Slide dots */}
          <div className="flex gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => { setFading(true); setTimeout(() => { setSlide(i); setFading(false); }, 300); }}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === slide ? 24 : 8,
                  background: i === slide ? '#00DF81' : 'rgba(255,255,255,0.35)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* ── RIGHT: Form ──────────────────────────────────────────────────── */}
      <div className="auth-in-right w-full lg:w-[460px] shrink-0 flex items-start lg:items-center justify-center px-6 py-8 lg:py-12 relative"
        style={{ background: 'var(--surface)' }}>

        {/* Subtle top brand line */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-none"
          style={{ background: 'linear-gradient(to right, var(--brand), var(--brand-bright))' }}/>

        <div className="auth-stagger w-full max-w-sm">

          {/* Back to home */}
          <Link to="/" className="tap inline-flex items-center gap-1.5 text-sm font-medium mb-8 hover:underline"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14}/> Back to Home
          </Link>

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <ZCleanLogo size={36} />
            <div>
              <p className="font-black text-sm uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>Z's Cleaning Services</p>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Calbayog City</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="font-serif font-bold text-3xl mb-1.5" style={{ color: 'var(--text-primary)' }}>
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Sign in to your account to continue
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-5 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="login-email">Email address</label>
              <input id="login-email" type="email" required autoComplete="email"
                onFocus={keyboardSafeFocus} className="input" placeholder="you@example.com"
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label !mb-0" htmlFor="login-password">Password</label>
                <Link to="/forgot-password" className="tap text-xs font-semibold hover:underline"
                  style={{ color: 'var(--brand)' }}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                {/* When the email is already filled in, start in the password
                    box so the returning user can type straight away. */}
                <input id="login-password" type={show ? 'text' : 'password'} required
                  autoFocus={!!rememberedEmail}
                  autoComplete="current-password" onFocus={keyboardSafeFocus} className="input pr-11" placeholder="••••••••"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                <button type="button" onClick={() => setShow(v => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                  style={{ color: 'var(--text-muted)' }}>
                  {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 !rounded-xl !text-base">
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Signing in…
                  </span>
                : 'Sign In →'
              }
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            No account yet?{' '}
            <Link to="/register" className="tap font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
              Create one here
            </Link>
          </p>

          <p className="text-center text-xs mt-8" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Z's Cleaning Services · Calbayog City
          </p>
        </div>
      </div>
    </div>
  );
}
