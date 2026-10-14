import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ZCleanLogo from '../components/ZCleanLogo.jsx';
import api from '../services/api.js';

// Different photo subset from Login/Register so each auth page feels distinct
const SLIDES = [
  '/staff/staff-3.jpg',
  '/staff/staff-6.jpg',
  '/staff/staff-9.jpg',
  '/staff/staff-1.jpg',
];

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step,    setStep]    = useState(0); // 0=email 1=otp 2=newpass 3=done
  const [email,   setEmail]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [pass,    setPass]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [show,    setShow]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [devOtp,  setDevOtp]  = useState('');
  const [slide,   setSlide]   = useState(0);
  const [fading,  setFading]  = useState(false);

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

  // ── All original form logic unchanged ────────────────────────────────────────
  const sendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter your email.');
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      if (data.dev_mode && data.dev_otp) {
        setOtp(data.dev_otp);
        setError('');
        setStep(1);
        setDevOtp(data.dev_otp);
      } else {
        setStep(1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Check your email address.');
    }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return setError('Please enter the 6-digit code.');
    setLoading(true); setError('');
    try {
      await api.post('/auth/verify-otp', { email, otp });
      setStep(2);
    } catch (err) { setError(err.response?.data?.message || 'Invalid or expired code.'); }
    finally { setLoading(false); }
  };

  const resetPass = async (e) => {
    e.preventDefault();
    if (pass.length < 8) return setError('Password must be at least 8 characters.');
    if (pass !== confirm) return setError('Passwords do not match.');
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { email, otp, new_password: pass });
      setStep(3);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) { setError(err.response?.data?.message || 'Reset failed. Try again.'); }
    finally { setLoading(false); }
  };

  const stepTitles    = ['Forgot Password?', 'Enter OTP Code', 'Set New Password', 'Password Reset!'];
  const stepSubtitles = [
    "Enter your email and we'll send a 6-digit code.",
    `We sent a code to ${email}. Check your inbox.`,
    'Choose a strong new password.',
    "You'll be redirected to login shortly.",
  ];

  // Mobile keyboards animate in over ~300ms; once settled, bring the focused
  // field into view. dvh handles most cases, this covers browsers that don't.
  const keyboardSafeFocus = (e) => {
    const el = e.target;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  };

  return (
    <div className="auth-page auth-shell flex" style={{ background: 'var(--surface)' }}>

      {/* ── LEFT: Staff photo slideshow — same pattern as Login/Register ── */}
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

        {/* Logo top-left */}
        <div className="absolute top-8 left-8 z-20 flex items-center gap-3">
          <ZCleanLogo size={40} />
          <div>
            <p className="font-black text-white text-sm uppercase tracking-tight leading-none">Z's Cleaning</p>
            <p className="text-[10px] font-bold tracking-widest uppercase mt-0.5" style={{ color: '#00DF81' }}>Services</p>
          </div>
        </div>

        {/* Bottom content — step indicator replaces bullet points */}
        <div className="absolute bottom-10 left-8 right-[22%] z-20">
          <h2 className="font-serif font-bold text-3xl text-white leading-snug mb-6">
            Secure password<br />recovery in 3 steps.
          </h2>
          <div className="space-y-3 mb-6">
            {['Enter your email', 'Verify the OTP code', 'Set a new password'].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                  i < step ? 'text-white' : i === step ? 'bg-white text-green-700' : 'border-2 text-transparent'
                }`}
                  style={{
                    background: i < step ? '#00DF81' : i === step ? 'white' : 'transparent',
                    borderColor: i < step ? '#00DF81' : 'rgba(255,255,255,0.3)',
                  }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <p className="text-sm font-medium"
                  style={{ color: i <= step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}>
                  {s}
                </p>
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

      {/* ── RIGHT: Form card — identical structure to Login/Register ─────── */}
      </div>

      <div className="auth-in-right w-full lg:w-[460px] shrink-0 flex items-start lg:items-center justify-center px-6 py-8 lg:py-12 relative"
        style={{ background: 'var(--surface)' }}>

        {/* Top brand line */}
        <div className="absolute top-0 left-0 right-0 h-1"
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
              {stepTitles[step]}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{stepSubtitles[step]}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-6 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Step 0: Email */}
          {step === 0 && (
            <form onSubmit={sendOtp} className="space-y-5">
              <div>
                <label className="label" htmlFor="fp-email">Email address</label>
                <input id="fp-email" type="email" required onFocus={keyboardSafeFocus} className="input" placeholder="you@example.com"
                  value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 !rounded-xl !text-base">
                {loading ? 'Sending…' : 'Send OTP Code →'}
              </button>
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                <Link to="/login" className="tap font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
                  ← Back to Sign In
                </Link>
              </p>
            </form>
          )}

          {/* Step 1: OTP */}
          {step === 1 && (
            <form onSubmit={verifyOtp} className="space-y-5">
              {devOtp && (
                <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-xl px-3 py-2 text-xs dark:bg-yellow-950 dark:border-yellow-700 dark:text-yellow-300">
                  <AlertTriangle size={13} className="inline mr-1 -mt-0.5"/>Dev mode — SMTP not configured.<br />
                  Your code is: <span className="font-black text-lg tracking-widest">{devOtp}</span>
                </div>
              )}
              <div>
                <label className="label" htmlFor="fp-otp">6-Digit Code</label>
                <input id="fp-otp" type="text" required maxLength={6}
                  onFocus={keyboardSafeFocus} className="input text-center text-3xl font-black tracking-[0.4em]"
                  placeholder="000000"
                  value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }} />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Didn't receive it? Check your spam folder.{' '}
                  <button type="button" onClick={() => { setStep(0); setOtp(''); setError(''); }}
                    className="underline font-semibold" style={{ color: 'var(--brand)' }}>
                    Resend
                  </button>
                </p>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 !rounded-xl !text-base">
                {loading ? 'Verifying…' : 'Verify Code →'}
              </button>
            </form>
          )}

          {/* Step 2: New password */}
          {step === 2 && (
            <form onSubmit={resetPass} className="space-y-5">
              <div>
                <label className="label" htmlFor="fp-pass">New Password</label>
                <div className="relative">
                  <input id="fp-pass" type={show ? 'text' : 'password'} required onFocus={keyboardSafeFocus} className="input pr-11"
                    placeholder="At least 8 characters"
                    value={pass} onChange={e => { setPass(e.target.value); setError(''); }} />
                  <button type="button" onClick={() => setShow(v => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                    {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="fp-confirm">Confirm Password</label>
                <input id="fp-confirm" type={show ? 'text' : 'password'} required onFocus={keyboardSafeFocus} className="input"
                  placeholder="Re-enter password"
                  value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} />
              </div>
              {pass.length > 0 && (
                <div className={`text-xs px-3 py-2 rounded-lg font-medium ${
                  pass.length >= 8 ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400'
                }`}>
                  {pass.length >= 8 ? '✓ Strong enough' : `${pass.length}/8 characters minimum`}
                </div>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 !rounded-xl !text-base">
                {loading ? 'Resetting…' : 'Reset Password →'}
              </button>
            </form>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl"
                style={{ background: 'var(--brand-pale)', border: '3px solid var(--brand)' }}>
                <CheckCircle2 size={40} style={{ color: 'var(--brand)' }}/>
              </div>
              <p className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
                Password reset! You can now sign in.
              </p>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Redirecting you to sign in…
              </p>
              <Link to="/login" className="btn-primary w-full !py-3.5 !rounded-xl !text-base inline-flex justify-center">
                Sign In Now →
              </Link>
            </div>
          )}

          <p className="text-center text-xs mt-8" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Z's Cleaning Services · Calbayog City
          </p>

        </div>
      </div>
    </div>
  );
}
