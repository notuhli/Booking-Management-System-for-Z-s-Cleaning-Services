import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Save, Eye, EyeOff, CheckCircle, Ban } from 'lucide-react';
import Navbar from '../../components/Navbar.jsx';
import { profileAPI } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.jsx';

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('profile');

  // Profile form
  const [name,  setName]  = useState(user?.name  || '');
  const [phone, setPhone] = useState(user?.phone  || '');
  const [pMsg,  setPMsg]  = useState('');
  const [pErr,  setPErr]  = useState('');
  const [pSaving, setPSaving] = useState(false);

  // Password form
  const [oldPw,  setOldPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwMsg,  setPwMsg]  = useState('');
  const [pwErr,  setPwErr]  = useState('');
  const [pwSaving,setPwSaving] = useState(false);

  // ── Email change ──
  // Email is the login identity, so the server requires the account password.
  // The form stays collapsed until the user explicitly chooses to change it,
  // keeping the profile tab calm for the common case.
  const [emailOpen,  setEmailOpen]  = useState(false);
  const [newEmail,   setNewEmail]   = useState('');
  const [emailPw,    setEmailPw]    = useState('');
  const [showEmailPw,setShowEmailPw]= useState(false);
  const [emailMsg,   setEmailMsg]   = useState('');
  const [emailErr,   setEmailErr]   = useState('');
  const [emailSaving,setEmailSaving]= useState(false);

  // ── Account deactivation ──
  // Password-gated like the email change, and refused while upcoming bookings
  // exist (enforced server-side) so the business is never left with jobs
  // scheduled for an account that can't sign in.
  const [deactOpen, setDeactOpen]   = useState(false);
  const [deactPw,   setDeactPw]     = useState('');
  const [deactErr,  setDeactErr]    = useState('');
  const [deactBusy, setDeactBusy]   = useState(false);

  const doDeactivate = async () => {
    setDeactErr('');
    if (!deactPw) return setDeactErr('Enter your password to confirm.');
    try {
      setDeactBusy(true);
      await profileAPI.deactivate({ password: deactPw });
      logout();                       // the account can no longer sign in
      navigate('/');
    } catch (e) {
      setDeactErr(e.response?.data?.message || "Couldn't deactivate your account — try again.");
    } finally { setDeactBusy(false); }
  };

  const saveEmail = async () => {
    setEmailMsg(''); setEmailErr('');
    if (!newEmail.trim() || !emailPw) return setEmailErr('Enter your new email and your password.');
    try {
      setEmailSaving(true);
      const { data } = await profileAPI.changeEmail({ new_email: newEmail.trim(), password: emailPw });
      updateUser(data.user);              // keep the session in sync — no re-login
      setEmailMsg(data.message || 'Email updated.');
      setNewEmail(''); setEmailPw(''); setEmailOpen(false);
    } catch (e) {
      setEmailErr(e.response?.data?.message || "Couldn't update your email — try again.");
    } finally { setEmailSaving(false); }
  };

  const saveProfile = async () => {
    if (!name.trim()) return setPErr('Name is required.');
    try {
      setPSaving(true); setPErr(''); setPMsg('');
      const res = await profileAPI.update({ name, phone });
      setPMsg('Profile updated!');
      if (updateUser) updateUser({ name: res.data.user?.name || name, phone });
    } catch (e) { setPErr(e.response?.data?.message || 'Error updating profile.'); }
    finally { setPSaving(false); }
  };

  const savePassword = async () => {
    if (!oldPw || !newPw || !confPw) return setPwErr('All fields are required.');
    if (newPw.length < 8) return setPwErr('New password must be at least 8 characters.');
    if (newPw !== confPw) return setPwErr('Passwords do not match.');
    try {
      setPwSaving(true); setPwErr(''); setPwMsg('');
      await profileAPI.changePassword({ current_password: oldPw, new_password: newPw });
      setPwMsg('Password changed!');
      setOldPw(''); setNewPw(''); setConfPw('');
    } catch (e) { setPwErr(e.response?.data?.message || 'Error changing password.'); }
    finally { setPwSaving(false); }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[var(--bg)] py-10 px-4">
        <div className="max-w-lg mx-auto">

          {/* Avatar Header */}
          <div className="text-center mb-8 anim-up-1">
            <div className="w-20 h-20 rounded-full bg-[var(--brand)] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-3">
              {(user?.name || 'U')[0].toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-[var(--fg)]">{user?.name}</h1>
            <p className="text-sm text-[var(--muted)]">{user?.email}</p>
          </div>

          {/* Tabs */}
          <div className="flex border border-[var(--border)] rounded-xl overflow-hidden mb-6 anim-up-2">
            {[
              { key:'profile', icon:<User size={15}/>, label:'Profile' },
              { key:'password', icon:<Lock size={15}/>, label:'Password' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition
                  ${tab === t.key
                    ? 'bg-[var(--brand)] text-white'
                    : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--fg)]'}`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {tab === 'profile' && (
            <div className="card p-5 anim-up-2">
              {pMsg && (
                <div className="mb-4 flex items-center gap-2 text-[var(--brand)] text-sm bg-[var(--brand-pale)] rounded-lg p-3">
                  <CheckCircle size={15}/> {pMsg}
                </div>
              )}
              {pErr && (
                <div className="mb-4 text-red-500 text-sm bg-red-50 rounded-lg p-3">{pErr}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="label">Full Name</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label !mb-0">Email Address</label>
                    <button type="button" onClick={() => { setEmailOpen(o => !o); setEmailErr(''); setEmailMsg(''); }}
                      className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
                      {emailOpen ? 'Cancel' : 'Change'}
                    </button>
                  </div>
                  <input className="input opacity-60 cursor-not-allowed" value={user?.email || ''} disabled />
                  {emailMsg && <p className="text-xs mt-1" style={{ color: 'var(--brand)' }}>{emailMsg}</p>}

                  {emailOpen && (
                    <div className="mt-3 rounded-xl p-3 space-y-2.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        This is your sign-in address and where booking updates are sent.
                        Confirm your password to change it.
                      </p>
                      <div>
                        <label className="label">New Email</label>
                        <input className="input" type="email" value={newEmail} placeholder="you@example.com"
                          onChange={e => setNewEmail(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Current Password</label>
                        <div className="relative">
                          <input className="input pr-11" type={showEmailPw ? 'text' : 'password'}
                            value={emailPw} placeholder="Your password"
                            onChange={e => setEmailPw(e.target.value)} />
                          <button type="button" onClick={() => setShowEmailPw(v => !v)}
                            aria-label={showEmailPw ? 'Hide password' : 'Show password'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
                            style={{ color: 'var(--text-muted)' }}>
                            {showEmailPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                          </button>
                        </div>
                      </div>
                      {emailErr && <p className="text-xs" style={{ color: '#dc2626' }}>{emailErr}</p>}
                      <button onClick={saveEmail} disabled={emailSaving}
                        className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                        {emailSaving ? 'Updating…' : 'Update Email'}
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Phone Number</label>
                  <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 09XXXXXXXXX" />
                </div>
                <button onClick={saveProfile} disabled={pSaving} className="btn-primary w-full flex items-center justify-center gap-2">
                  {pSaving ? 'Saving...' : <><Save size={15}/> Save Profile</>}
                </button>
              </div>
            </div>
          )}

          {/* Password Tab */}
          {tab === 'password' && (
            <div className="card p-5 anim-up-2">
              {pwMsg && (
                <div className="mb-4 flex items-center gap-2 text-[var(--brand)] text-sm bg-[var(--brand-pale)] rounded-lg p-3">
                  <CheckCircle size={15}/> {pwMsg}
                </div>
              )}
              {pwErr && (
                <div className="mb-4 text-red-500 text-sm bg-red-50 rounded-lg p-3">{pwErr}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="label">Current Password</label>
                  <div className="relative">
                    <input
                      type={showOld ? 'text' : 'password'} className="input pr-10"
                      value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowOld(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                      {showOld ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">New Password</label>
                  <div className="relative">
                    <input
                      type={showNew ? 'text' : 'password'} className="input pr-10"
                      value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                      {showNew ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input
                    type="password" className="input"
                    value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="••••••••"
                  />
                </div>
                <button onClick={savePassword} disabled={pwSaving} className="btn-primary w-full flex items-center justify-center gap-2">
                  {pwSaving ? 'Saving...' : <><Lock size={15}/> Change Password</>}
                </button>
              </div>
            </div>
          )}

          {/* Account deactivation — kept visually separate and understated so
              it can't be mistaken for a normal setting. */}
          <div className="card p-5 mt-5" style={{ borderLeft: '3px solid #dc2626' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Deactivate Account</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  You won't be able to sign in. Your booking history is kept, and you can
                  contact us any time to reactivate.
                </p>
              </div>
              <button onClick={() => { setDeactOpen(o => !o); setDeactErr(''); }}
                className="text-xs font-semibold hover:underline shrink-0" style={{ color: '#dc2626' }}>
                {deactOpen ? 'Cancel' : 'Deactivate'}
              </button>
            </div>

            {deactOpen && (
              <div className="mt-4 space-y-2.5">
                <div>
                  <label className="label">Confirm your password</label>
                  <input className="input" type="password" value={deactPw}
                    placeholder="Your password"
                    onChange={e => setDeactPw(e.target.value)} />
                </div>
                {deactErr && <p className="text-xs" style={{ color: '#dc2626' }}>{deactErr}</p>}
                <button onClick={doDeactivate} disabled={deactBusy}
                  className="w-full text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  style={{ background: '#dc2626', color: '#fff' }}>
                  <Ban size={14}/> {deactBusy ? 'Deactivating…' : 'Deactivate My Account'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
