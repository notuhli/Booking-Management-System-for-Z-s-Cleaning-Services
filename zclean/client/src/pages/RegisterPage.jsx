import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Sparkles } from 'lucide-react';
import ZCleanLogo from '../components/ZCleanLogo.jsx';
import AddressSelector from '../components/AddressSelector.jsx';
import api from '../services/api.js';

const STEPS = ['Account', 'Address', 'Password'];

// Use different photo order from LoginPage so they feel distinct
const SLIDES = [
  '/staff/staff-1.jpg',
  '/staff/staff-6.jpg',
  '/staff/staff-5.jpg',
  '/staff/staff-4.jpg',
  '/staff/staff-8.jpg',
  '/staff/staff-7.jpg',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step,    setStep]   = useState(0);
  const [form,    setForm]   = useState({ name:'', email:'', phone:'', address:'', password:'', confirm:'' });
  const [show,    setShow]   = useState(false);
  const [loading, setLoading]= useState(false);
  const [error,   setError]  = useState('');
  const [slide,   setSlide]  = useState(0);
  const [fading,  setFading] = useState(false);

  // Slideshow — 5s interval
  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length);
        setFading(false);
      }, 600);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // ── Live "email already used" check ────────────────────────────────────────
  // 'idle' | 'checking' | 'free' | 'taken'. Waits 500 ms after the last
  // keystroke so it asks once when the user stops typing, not once per letter.
  const [emailState, setEmailState] = useState('idle');
  useEffect(() => {
    const value = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setEmailState('idle'); return; }
    setEmailState('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/check-email', { params: { email: value } });
        if (!cancelled) setEmailState(data.available ? 'free' : 'taken');
      } catch {
        // Never block registration because the check itself failed.
        if (!cancelled) setEmailState('idle');
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.email]);

  const next = (e) => {
    e.preventDefault();
    if (emailState === 'taken')
      return setError('That email is already registered. Please use another one or log in.');
    setError('');
    setStep(s => s + 1);
  };
  const back = () => setStep(s => s - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true); setError('');
    try {
      await api.post('/auth/register', {
        name: form.name, email: form.email, phone: form.phone,
        address: form.address, password: form.password,
      });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally { setLoading(false); }
  };

  const stepPct = ((step) / (STEPS.length - 1)) * 100;

  // Mobile keyboards animate in over ~300ms; once settled, bring the focused
  // field into view. dvh handles most cases, this covers browsers that don't.
  const keyboardSafeFocus = (e) => {
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  };

  return (
    <div className="auth-page auth-shell flex" style={{ background: 'var(--surface)' }}>

      {/* ── LEFT: Staff photo slideshow ─────────────────────────────────── */}
      <div className="auth-in-left hidden lg:block relative flex-1">
        {/* Accent layer — 4px wider than the content layer, so a thin
            brand-green sliver shows along the diagonal separator. */}
        <div className="absolute inset-0"
          style={{ clipPath: 'polygon(0 0, 82% 0, 100% 100%, 0 100%)', background: 'var(--brand-bright)' }}/>
        {/* Content layer — same angle, inset by 4px. */}
        <div className="absolute inset-0 overflow-hidden"
          style={{ clipPath: 'polygon(0 0, calc(82% - 4px) 0, calc(100% - 4px) 100%, 0 100%)' }}>
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

        {/* Gradient overlay */}
        <div className="absolute inset-0 z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,15,15,0.88) 0%, rgba(3,34,33,0.4) 50%, rgba(0,15,15,0.18) 100%)' }}/>

        {/* Logo */}
        <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
          <ZCleanLogo size={40} />
          <div>
            <p className="font-black text-white text-sm uppercase tracking-tight leading-none">Z's Cleaning</p>
            <p className="text-[10px] font-bold tracking-widest uppercase mt-0.5" style={{ color: '#00DF81' }}>Services</p>
          </div>
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-10 left-8 right-[22%] z-20">
          <h2 className="font-serif font-bold text-3xl text-white leading-snug mb-4">
            Join hundreds of<br />happy clients.
          </h2>
          <div className="space-y-2 mb-6">
            {[
              'Book online in under 3 minutes',
              'Serving Calbayog City & nearby areas',
              'Trusted, background-checked cleaners',
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

      {/* ── RIGHT: Register form card ────────────────────────────────────── */}
      <div className="auth-in-right w-full lg:w-[480px] shrink-0 flex items-start lg:items-center justify-center px-6 py-8 lg:py-12 relative"
        style={{ background: 'var(--surface)' }}>

        {/* Top brand line */}
        <div className="absolute top-0 left-0 right-0 h-1"
          style={{ background: 'linear-gradient(to right, var(--brand), var(--brand-bright))' }}/>

        <div className="auth-stagger w-full max-w-sm">

          {/* Back to home */}
          <Link to="/" className="tap inline-flex items-center gap-1.5 text-sm font-medium mb-6 hover:underline"
            style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={14}/> Back to Home
          </Link>

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-6 lg:hidden">
            <ZCleanLogo size={36} />
            <div>
              <p className="font-black text-sm uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>Z's Cleaning Services</p>
              <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Calbayog City</p>
            </div>
          </div>

          {/* Heading */}
          <h1 className="font-serif font-bold text-2xl mb-1" style={{ color: 'var(--text-primary)' }}>
            Create your account
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>

          {/* Step progress bar */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              {STEPS.map((s, i) => (
                <span key={s} className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: i <= step ? 'var(--brand)' : 'var(--text-muted)' }}>
                  {s}
                </span>
              ))}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: 'var(--brand)' }}/>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step 0 — Account info */}
          {step === 0 && (
            <form onSubmit={next} className="space-y-4">
              <div>
                <label className="label" htmlFor="reg-name">Full Name</label>
                <input id="reg-name" onFocus={keyboardSafeFocus} className="input" required placeholder="Juan dela Cruz"
                  value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
              </div>
              <div>
                <label className="label" htmlFor="reg-email">Email Address</label>
                <input id="reg-email" onFocus={keyboardSafeFocus} type="email" required placeholder="you@example.com"
                  className={`input ${emailState === 'taken' ? '!border-red-400 dark:!border-red-700' : ''}`}
                  aria-invalid={emailState === 'taken'}
                  value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
                {/* Message sits directly under the box so it is read with the field. */}
                {emailState === 'taken' && (
                  <p className="text-xs mt-1.5 text-red-600 dark:text-red-400">
                    This email is already registered.{' '}
                    <Link to="/login" className="underline font-medium">Log in instead</Link>
                  </p>
                )}
                {emailState === 'free' && (
                  <p className="text-xs mt-1.5 text-green-600 dark:text-green-400">Email is available.</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="reg-phone">
                  Phone <span className="font-normal normal-case" style={{ color: 'var(--text-muted)' }}>(optional)</span>
                </label>
                <input id="reg-phone" onFocus={keyboardSafeFocus} className="input" placeholder="09XX-XXX-XXXX"
                  value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
              </div>
              <button type="submit" disabled={emailState === 'taken'}
                className="btn-primary w-full !py-3 !rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                Continue →
              </button>
            </form>
          )}

          {/* Step 1 — Address */}
          {step === 1 && (
            <form onSubmit={next} className="space-y-4">
              <div>
                <label className="label">Service Address</label>
                <AddressSelector value={form.address} onChange={v => setForm(p => ({...p, address: v}))} />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  This will be pre-filled when you book a service.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={back} className="btn-secondary flex-1 !py-3 !rounded-xl">
                  ← Back
                </button>
                <button type="submit" className="btn-primary flex-1 !py-3 !rounded-xl">
                  Continue →
                </button>
              </div>
            </form>
          )}

          {/* Step 2 — Password */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="reg-password">Password</label>
                <div className="relative">
                  <input id="reg-password" onFocus={keyboardSafeFocus} className="input pr-11" type={show ? 'text' : 'password'}
                    required placeholder="Min. 8 characters"
                    value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
                  <button type="button" onClick={() => setShow(v => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}>
                    {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
                {/* Live length hint — muted until valid, green once ≥ 6 chars */}
                {form.password.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: form.password.length >= 8 ? '#16a34a' : 'var(--text-muted)' }}>
                    {form.password.length >= 8 ? '✓ At least 8 characters' : `At least 8 characters (${form.password.length}/8)`}
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="reg-confirm">Confirm Password</label>
                <div className="relative">
                  <input id="reg-confirm" onFocus={keyboardSafeFocus} className="input pr-11" type={show ? 'text' : 'password'}
                    required placeholder="Re-enter password"
                    value={form.confirm} onChange={e => setForm(p => ({...p, confirm: e.target.value}))} />
                  {/* Shares the same `show` state as the password field above,
                      so toggling either reveals both — one mental model. */}
                  <button type="button" onClick={() => setShow(v => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}>
                    {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
                {/* Live match hint — only appears once the user starts typing here,
                    so it never scolds prematurely */}
                {form.confirm.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: form.confirm === form.password ? '#16a34a' : '#dc2626' }}>
                    {form.confirm === form.password ? '✓ Passwords match' : '✕ Passwords do not match'}
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={back} className="btn-secondary flex-1 !py-3 !rounded-xl">
                  ← Back
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 !py-3 !rounded-xl">
                  {loading ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="tap font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Z's Cleaning Services · Calbayog City
          </p>
        </div>
      </div>
    </div>
  );
}
