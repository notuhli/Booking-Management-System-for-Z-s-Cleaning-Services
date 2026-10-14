import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CalendarCheck, Banknote, Clock, TrendingUp,
  Star, ChevronLeft, ChevronRight, CalendarDays, Plus, X, Lock, CheckCircle,
  StickyNote, Pencil, Trash2,
  AlertTriangle, Pin
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { usePolling } from '../../hooks/usePolling.jsx';
import { reportsAPI, bookingsAPI, calendarAPI, notesAPI } from '../../services/api.js';
import { localDate, localDateOffset } from '../../utils/localDate.js';

const BADGE = { pending:'badge-pending', confirmed:'badge-confirmed', done:'badge-done', completed:'badge-done', cancelled:'badge-cancelled' };
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const TODAY = localDate();

// ── CountUp — animates a stat from 0 to its value on first render ──
// Accepts plain numbers or formatted strings like "₱12,345": it extracts the
// numeric part, eases from 0 over ~800ms (requestAnimationFrame), and
// re-applies the prefix + comma formatting each frame. Falls back to showing
// the raw value instantly if it contains no digits.
function CountUp({ value }) {
  const str    = String(value);
  const target = Number(str.replace(/[^0-9.]/g, ''));
  const prefix = str.startsWith('₱') ? '₱' : '';
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!isFinite(target) || target === 0) { setN(target || 0); return; }
    let raf; const t0 = performance.now(); const dur = 800;
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      setN(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!/\d/.test(str)) return str;
  return prefix + Math.round(n).toLocaleString();
}

// ── Interactive Admin Calendar ────────────────────────────────────────────────
function AdminCalendar({ blockedDates, bookedDates, onBlock, onUnblock }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [hovered, setHovered] = useState(null);

  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  const ds = day => {
    const m = String(view.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${view.year}-${m}-${d}`;
  };

  const getBlocked  = d => blockedDates.find(b => b.date === d);
  const getBooked   = d => bookedDates.find(b => b.date === d);
  const isPast      = d => d < TODAY;
  const isToday     = d => d === TODAY;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="card p-0 overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setView(v => v.month === 0 ? { year: v.year-1, month: 11 } : { ...v, month: v.month-1 })}
          className="p-1.5 rounded-lg hover:bg-black/10 transition" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16}/>
        </button>
        <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
          {MONTHS[view.month]} {view.year}
        </p>
        <button onClick={() => setView(v => v.month === 11 ? { year: v.year+1, month: 0 } : { ...v, month: v.month+1 })}
          className="p-1.5 rounded-lg hover:bg-black/10 transition" style={{ color: 'var(--text-secondary)' }}>
          <ChevronRight size={16}/>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-3 pt-2.5 pb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`}/>;
          const d       = ds(day);
          const blocked = getBlocked(d);
          const booked  = getBooked(d);
          const past    = isPast(d);
          const today   = isToday(d);
          const isHov   = hovered === d;

          let bg = 'transparent', color = 'var(--text-primary)', dot = null;
          let title = '';

          if (today)   { bg = 'var(--brand)'; color = 'white'; }
          if (blocked) { bg = '#fee2e2'; color = '#b91c1c'; title = blocked.reason || 'Blocked'; }
          if (booked?.full && !blocked) { dot = 'bg-red-400'; }
          else if (booked && !blocked)  { dot = 'bg-yellow-400'; }
          if (past && !today) color = 'var(--text-muted)';

          // hover state for unblocked future dates
          if (isHov && !blocked && !past) { bg = '#dcfce7'; color = '#166534'; }

          return (
            <div key={d} className="relative group"
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}>
              <button
                onClick={() => blocked ? onUnblock(blocked) : (!past && onBlock(d))}
                disabled={past && !blocked}
                title={title || (blocked ? 'Click to unblock' : past ? '' : 'Click to block')}
                className="w-full flex items-center justify-center h-9 rounded-xl text-xs font-semibold transition-all relative"
                style={{ background: bg, color, cursor: past && !blocked ? 'default' : 'pointer',
                         opacity: past && !today && !blocked ? 0.35 : 1 }}>
                {day}
                {blocked && <Lock size={8} className="absolute top-0.5 right-0.5 opacity-60"/>}
                {dot && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dot}`}/>}
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
        {[
          ['bg-green-500','Today'],
          ['bg-yellow-400','1 booking'],
          ['bg-red-400','Fully booked'],
          ['bg-red-200','Blocked (holiday/rest)'],
        ].map(([cls, lbl]) => (
          <span key={lbl} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span className={`w-2 h-2 rounded-full ${cls} inline-block`}/>{lbl}
          </span>
        ))}
      </div>
      <p className="px-4 pb-2.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Click a future date to block it. Click a blocked date to unblock.
      </p>
    </div>
  );
}

// ── Block Date Modal ──────────────────────────────────────────────────────────
function BlockModal({ date, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH',
    { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Block This Date</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{fmt(date)}</p>
        <div className="mb-4">
          <label className="label">Reason <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
          <input className="input" placeholder="e.g. Holiday, Staff rest day…"
            value={reason} onChange={e => setReason(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(reason)} autoFocus/>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button onClick={() => onConfirm(reason)}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5">
            <Lock size={13}/> Block Date
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [confirmState, setConfirmState] = useState(null);
  const { showToast } = useToast();
  const [stats,        setStats]        = useState(null);
  const [bookings,     setBookings]     = useState([]);
  const [upcoming,     setUpcoming]     = useState([]);
  const [notes,        setNotes]        = useState([]);
  const [noteDraft,    setNoteDraft]    = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [editingNote,  setEditingNote]  = useState(null); // { id, content }
  const [blockedDates, setBlockedDates] = useState([]);
  const [bookedDates,  setBookedDates]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);
  const [blockTarget,  setBlockTarget]  = useState(null); // date string to block
  const [calMsg,       setCalMsg]       = useState('');

  const loadAll = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);   // background refresh keeps the page visible
      setLoadError(false);
      const [sRes, bRes, blRes, bdRes] = await Promise.all([
        reportsAPI.dashboard(),
        bookingsAPI.getAll(),
        calendarAPI.getBlocked(),
        calendarAPI.getBookedDates(),
      ]);
      setStats(sRes.data);
      const allBookings = bRes.data || [];
      // Recent Bookings: only those CREATED within the last 7 days (API
      // already sorts by created_at DESC), capped at 8 as before.
      const cutStr = localDateOffset(-7);
      setBookings(allBookings.filter(b => ((b.created_at || b.date || '')).slice(0, 10) >= cutStr).slice(0, 8));
      // Upcoming pending/confirmed bookings within the next 7 days — powers
      // the reminders strip. Uses the full response BEFORE the slice(0,8)
      // above, and the same local-date convention as TODAY.
      const week = localDateOffset(7);
      setUpcoming(allBookings.filter(b =>
        ['pending', 'confirmed'].includes(b.status) &&
        (b.date || '').slice(0, 10) > TODAY &&
        (b.date || '').slice(0, 10) <= week
      ));
      setBlockedDates(blRes.data || []);   // [{id, date, reason}]
      setBookedDates(bdRes.data || []);    // [{date, full}]
    } catch (e) { console.error('Dashboard error:', e.message); setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);
  // Today's schedule and the stat cards keep themselves current.
  usePolling(() => loadAll(true), 30000);

  const handleBlock = async (reason) => {
    try {
      await calendarAPI.block({ date: blockTarget, reason: reason || null });
      setCalMsg(`${blockTarget} blocked.`);
      setBlockTarget(null);
      const res = await calendarAPI.getBlocked();
      setBlockedDates(res.data || []);
    } catch (e) { setCalMsg(e.response?.data?.message || "Couldn't block the date — try again."); }
  };

  const handleUnblock = (blockedObj) => {
    setConfirmState({
      message: `Unblock ${blockedObj.date}${blockedObj.reason ? ` (${blockedObj.reason})` : ''}?`,
      confirmLabel: 'Unblock',
      danger: false,
      onConfirm: async () => {
        try {
          await calendarAPI.unblock(blockedObj.id);
          setCalMsg(`${blockedObj.date} unblocked.`);
          const res = await calendarAPI.getBlocked();
          setBlockedDates(res.data || []);
        } catch (e) { setCalMsg(e.response?.data?.message || "Couldn't unblock the date — try again."); }
      },
    });
  };

  const fmt = d => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }); }
    catch { return d; }
  };

  // Overview metrics split by what they answer:
  // heroStats — "how's the business overall?" (all-time totals, Revenue dominant)
  // pipeline  — "where are today's bookings?" (a real sequence: every booking
  //             travels pending → confirmed → done, so it renders as a flow)
  const heroStats = stats ? [
    { label:'Total Revenue',  value:`₱${Number(stats.total_revenue||0).toLocaleString()}`, icon:<Banknote size={22}/>, clr:'var(--brand)', bg:'var(--brand-pale)', hero:true },
    { label:'Total Bookings', value: stats.total_bookings ?? 0,  icon:<CalendarCheck size={20}/>, clr:'#1d4ed8', bg:'#dbeafe' },
    { label:'Total Clients',  value: stats.total_clients  ?? 0,  icon:<Users size={20}/>,        clr:'#7c3aed', bg:'#ede9fe' },
  ] : [];
  const pipeline = stats ? [
    { label:'Pending',   value: stats.pending   ?? 0, icon:<Clock size={16}/>,        clr:'#b45309', bg:'#fef9c3' },
    { label:'Confirmed', value: stats.confirmed ?? 0, icon:<CalendarDays size={16}/>, clr:'#0891b2', bg:'#e0f2fe' },
    { label:'Done',      value: stats.done      ?? 0, icon:<CheckCircle size={16}/>,  clr:'#b45309', bg:'#fef3c7' },
    { label:'Completed', value: stats.completed ?? 0, icon:<Banknote size={16}/>,     clr:'#166534', bg:'#dcfce7' },
  ] : [];
  // ── Admin notes — personal scratchpad on the dashboard ──
  const loadNotes = () => notesAPI.list().then(r => setNotes(r.data || [])).catch(() => {});
  useEffect(() => { loadNotes(); }, []);

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    try {
      await notesAPI.create(noteDraft);
      setNoteDraft('');
      setShowNoteInput(false);
      showToast('Note added', 'success');
      loadNotes();
    } catch { showToast("Couldn't add the note — try again.", 'error'); }
  };
  const saveNote = async () => {
    if (!editingNote?.content.trim()) return;
    try {
      await notesAPI.update(editingNote.id, editingNote.content);
      setEditingNote(null);
      showToast('Note updated', 'success');
      loadNotes();
    } catch { showToast("Couldn't update the note — try again.", 'error'); }
  };
  const deleteNote = (id) => setConfirmState({
    message: 'Delete this note?',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      try {
        await notesAPI.remove(id);
        showToast('Note deleted', 'success');
        loadNotes();
      } catch { showToast("Couldn't delete the note — try again.", 'error'); }
    },
  });

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <>
    <AdminLayout title="Dashboard">
      {/* Load failure banner — without this, a dead server shows ₱0 revenue
          and 0 bookings as if they were real numbers */}
      {!loading && loadError && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3 mb-4"
          style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>
            <AlertTriangle size={16} className="inline mr-1.5 -mt-0.5"/>Couldn't load dashboard data — the numbers below may be incorrect.
          </p>
          <button onClick={loadAll} className="btn-primary" style={{ padding: '6px 16px' }}>Retry</button>
        </div>
      )}
      {blockTarget && (
        <BlockModal
          date={blockTarget}
          onConfirm={handleBlock}
          onClose={() => setBlockTarget(null)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <svg className="animate-spin h-10 w-10" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      ) : (
        <div className="space-y-6 max-w-5xl mx-auto">

          {/* ── Greeting — temporal anchor so the dashboard opens as a
                 workspace, not a report ── */}
          <div className="anim-up-1">
            <p className="font-greeting text-3xl font-bold leading-tight" style={{ color: 'var(--brand)' }}>{greeting()}!</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* ── Overview row: Reminders (left, calendar-width) beside the
                 stats stack (right): revenue hero, totals pair, and a compact
                 pipeline. Reminders is always rendered — "nothing upcoming"
                 is information too — so the grid never has a hole. ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">

            {/* LEFT: Reminders + Notes combined — both are "the owner's
                memory": what the system reminds her of, and what she notes
                for herself. One card, one glance. */}
            {(() => {
              const tomorrowStr = localDateOffset(1);
              const byDate = {};
              upcoming.forEach(b => {
                const d = (b.date || '').slice(0, 10);
                (byDate[d] = byDate[d] || []).push(b);
              });
              const dates = Object.keys(byDate).sort().slice(0, 4);
              const nice = d => new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
              return (
                <div className="card p-4 anim-up-1 h-full flex flex-col" style={{ borderLeft: '4px solid var(--brand)' }}>
                  {/* Reminders */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      <Pin size={14} style={{ color: 'var(--brand)' }}/>Reminders
                    </p>
                    <button onClick={() => navigate('/admin/bookings')}
                      className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
                      View Bookings
                    </button>
                  </div>
                  {dates.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      No upcoming bookings in the next 7 days — all clear!
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {dates.map(d => (
                        <p key={d} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {d === tomorrowStr
                            ? <><span className="font-semibold" style={{ color: 'var(--brand)' }}>Tomorrow ({nice(d)})</span> — {byDate[d].length} booking{byDate[d].length !== 1 ? 's' : ''}</>
                            : <>{nice(d)} — {byDate[d].length} booking{byDate[d].length !== 1 ? 's' : ''}</>}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="my-3" style={{ borderTop: '1px solid var(--border)' }}/>

                  {/* Notes */}
                  <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                    <StickyNote size={14} style={{ color: 'var(--brand)' }}/>Notes
                  </p>
                  <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: 170 }}>
                    {notes.length === 0 && (
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No notes yet — jot down anything to remember.</p>
                    )}
                    {notes.map(n => (
                      <div key={n.id} className="flex items-start gap-2 rounded-lg px-2.5 py-2 group"
                        style={{ background: 'var(--surface2)' }}>
                        {editingNote?.id === n.id ? (
                          <>
                            <textarea autoFocus rows={2} value={editingNote.content}
                              onChange={e => setEditingNote(p => ({ ...p, content: e.target.value }))}
                              className="flex-1 text-sm bg-transparent resize-none outline-none"
                              style={{ color: 'var(--text-primary)' }}/>
                            <button onClick={saveNote} className="text-xs font-semibold shrink-0" style={{ color: 'var(--brand)' }}>Save</button>
                            <button onClick={() => setEditingNote(null)} className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <p className="flex-1 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{n.content}</p>
                            <button onClick={() => setEditingNote({ id: n.id, content: n.content })}
                              aria-label="Edit note" className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                              style={{ color: 'var(--text-muted)' }}><Pencil size={13}/></button>
                            <button onClick={() => deleteNote(n.id)}
                              aria-label="Delete note" className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                              style={{ color: '#dc2626' }}><Trash2 size={13}/></button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* + button (bottom-left) expands into the add-note input */}
                  <div className="mt-3">
                    {showNoteInput ? (
                      <div className="flex gap-2">
                        <input autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addNote(); if (e.key === 'Escape') { setShowNoteInput(false); setNoteDraft(''); } }}
                          placeholder="Add a note..."
                          className="input flex-1 !py-1.5 text-sm"/>
                        <button onClick={addNote} disabled={!noteDraft.trim()}
                          className="btn-primary shrink-0" style={{ padding: '6px 14px' }}>Add</button>
                        <button onClick={() => { setShowNoteInput(false); setNoteDraft(''); }}
                          aria-label="Cancel adding note" className="shrink-0" style={{ color: 'var(--text-muted)' }}><X size={16}/></button>
                      </div>
                    ) : (
                      <button onClick={() => setShowNoteInput(true)} aria-label="Add a note"
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                        <Plus size={16}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* RIGHT: stats stack */}
            <div className="flex flex-col gap-3">
              {/* Revenue hero */}
              <div className="card chart-card-premium p-4 anim-up-1 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: heroStats[0]?.bg, color: heroStats[0]?.clr }}>{heroStats[0]?.icon}</div>
                <div>
                  <p className="font-black text-3xl leading-tight" style={{ color: 'var(--brand)' }}><CountUp value={heroStats[0]?.value}/></p>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{heroStats[0]?.label}</p>
                </div>
              </div>
              {/* Totals pair */}
              <div className="grid grid-cols-2 gap-3">
                {heroStats.slice(1).map((c, i) => (
                  <div key={i} className="card chart-card-premium p-3 anim-up-1 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: c.bg, color: c.clr }}>{c.icon}</div>
                    <div>
                      <p className="font-black text-lg leading-tight" style={{ color: c.clr }}><CountUp value={c.value}/></p>
                      <p className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text-muted)' }}>{c.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Compact pipeline */}
              <div className="card chart-card-premium p-3 anim-up-1 flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-bold tracking-widest" style={{ color: 'var(--text-muted)' }}>BOOKING PIPELINE</p>
                  {/* Cancelled is an exit from the flow, not a stage in it — shown
                      beside the pipeline, muted, so it never reads as progress. */}
                  {(stats?.cancelled ?? 0) > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                      {stats.cancelled} cancelled
                    </span>
                  )}
                </div>
                {/* Four stages in one row is 8px too wide for a phone, and
                    squeezing them clipped the labels ("Confirme…"). Below the
                    small breakpoint they become a 2x2 grid — same information,
                    nothing truncated — and the arrows are dropped, since they
                    only read as a sequence when the stages are in a line. */}
                <div className="grid grid-cols-2 gap-y-3 sm:flex sm:items-center">
                  {pipeline.map((s, i) => (
                    <div key={s.label} className="flex items-center sm:flex-1 min-w-0">
                      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: s.bg, color: s.clr }}>{s.icon}</div>
                        <div className="min-w-0">
                          <p className="font-black text-base leading-tight" style={{ color: s.clr }}><CountUp value={s.value}/></p>
                          <p className="text-[10px] sm:text-[9px] font-semibold leading-tight" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                        </div>
                      </div>
                      {i < pipeline.length - 1 && (
                        <ChevronRight size={14} className="shrink-0 hidden sm:block" style={{ color: 'var(--text-muted)', opacity: 0.5 }}/>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Quick actions — Services, Clients, Reports: the pages with no
                 other presence on this dashboard. Bookings intentionally has
                 no card here — the sidebar badge, the Reminders card's View
                 Bookings button, and Recent Bookings' View All already cover
                 it; a fourth route was redundant. ── */}
          <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Services',  sub:'Edit packages',      to:'/admin/services',  icon:<Star size={17}/> },
                { label:'Clients',   sub:'View all clients',   to:'/admin/clients',   icon:<Users size={17}/> },
                { label:'Reports',   sub:'Revenue & expenses', to:'/admin/reports',   icon:<TrendingUp size={17}/> },
              ].map(a => (
                <button key={a.to} onClick={() => navigate(a.to)}
                  className="card p-4 text-left hover:shadow-md transition group">
                  <div className="mb-2 group-hover:scale-110 transition-transform inline-block"
                    style={{ color: 'var(--brand)' }}>{a.icon}</div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{a.label}</p>
                  {/* Hide subtitle on small screens — too narrow at 3-cols on mobile */}
                  <p className="text-xs mt-0.5 hidden sm:block" style={{ color: 'var(--text-muted)' }}>{a.sub}</p>
                </button>
              ))}
          </div>

          {/* ── Calendar + Recent Bookings ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Interactive Calendar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Booking Calendar
                </h2>
                {blockedDates.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">
                    {blockedDates.length} date{blockedDates.length > 1 ? 's' : ''} blocked
                  </span>
                )}
              </div>

              {calMsg && (
                <div className="mb-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between"
                  style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                  {calMsg}
                  <button onClick={() => setCalMsg('')}><X size={12}/></button>
                </div>
              )}

              <AdminCalendar
                blockedDates={blockedDates}
                bookedDates={bookedDates}
                onBlock={date => setBlockTarget(date)}
                onUnblock={handleUnblock}
              />

              {/* Blocked dates list */}
              {blockedDates.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Blocked Dates:</p>
                  {blockedDates.map(b => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                      <span className="font-semibold">
                        {fmt(b.date)}{b.reason ? ` — ${b.reason}` : ''}
                      </span>
                      <button onClick={() => handleUnblock(b)}
                        className="font-bold hover:underline ml-2">Unblock</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Bookings */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Recent Bookings</h2>
                <button onClick={() => navigate('/admin/bookings')}
                  className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
                  View All
                </button>
              </div>
              <div className="card p-0 overflow-hidden">
                {bookings.length === 0 ? (
                  <div className="text-center py-10">
                    <CalendarCheck size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }}/>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No bookings yet.</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {bookings.map(b => (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--brand)' }}>
                          {(b.client_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{b.client_name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {b.service_name} · {fmt(b.date)}
                          </p>
                        </div>
                        <span className={`badge ${BADGE[b.status] || 'badge-info'} text-xs shrink-0`}>{b.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </AdminLayout>
    <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
