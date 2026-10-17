import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, CreditCard, Banknote, AlertCircle, ChevronRight, ChevronLeft, Info, X } from 'lucide-react';
import Navbar from '../../components/Navbar.jsx';
import AddressSelector from '../../components/AddressSelector.jsx';
import { servicesAPI, bookingsAPI, globalAddonsAPI, settingsAPI, calendarAPI, transportFeesAPI } from '../../services/api.js';
import { localDate } from '../../utils/localDate.js';
import { isLeadIn } from '../../utils/serviceBullets.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';


const SERVICE_DETAILS = {
  'Standard Clean': [
    'Sweeping & mopping of all floors',
    'Dusting of furniture & surfaces',
    'Wiping of tables, counters, appliances (outer surface only)',
    'Bathroom cleaning (toilet, sink, floor, mirror)',
    'Kitchen cleaning (sink, counters, stovetop)',
    'General trash disposal',
    'Basic disinfection of high-touch areas',
  ],
  'Platinum Clean': [
    'Includes everything in Standard, plus:',
    'Deep scrubbing of bathroom tiles & grout',
    'Interior window cleaning (glass, sills, frames)',
    'Detailed dusting (corners, baseboards, ceiling edges)',
    'Vacuuming of sofas, carpets & curtains (if any)',
    'Appliance surface detail (fridge, microwave, oven outside)',
    'Extra disinfection (bathroom & kitchen focus)',
  ],
  'Deep Cleaning': [
    'Includes everything in Platinum, plus:',
    'Complete kitchen deep clean (fridge, oven, cabinets outside)',
    'Heavy scrubbing of floors (stains, corners, hard-to-reach areas)',
    'Mattress vacuuming & dust mite treatment',
    'Furniture moving for full-area clean (where possible)',
    'Comprehensive bathroom sanitation (shower, hard water stains, molds)',
    'Full disinfection of all rooms',
  ],
};

const TODAY = localDate();

// Same-day booking rule: every service starts at 9:00 AM, so once 9 AM has
// passed there is no slot left to book today. Mirrors the server-side guard in
// booking-controller.js — the server stays authoritative; this is for UX.
const SERVICE_START_HOUR = 9;
const TODAY_CLOSED = new Date().getHours() >= SERVICE_START_HOUR;

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function BookingCalendar({ selectedDate, onSelect, blockedDates, bookedDates }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  const firstDay     = new Date(view.year, view.month, 1).getDay();
  const daysInMonth  = new Date(view.year, view.month + 1, 0).getDate();
  const prevMonth    = () => setView(v => v.month === 0 ? { year: v.year-1, month: 11 } : { ...v, month: v.month-1 });
  const nextMonth    = () => setView(v => v.month === 11 ? { year: v.year+1, month: 0 }  : { ...v, month: v.month+1 });

  const ds = (day) => {
    const m = String(view.month + 1).padStart(2,'0');
    const d = String(day).padStart(2,'0');
    return `${view.year}-${m}-${d}`;
  };

  const isBlocked  = d => blockedDates.includes(d);
  const bookedInfo = d => bookedDates.find(b => b.date === d);
  const isFull     = d => { const b = bookedInfo(d); return b && b.full; };
  const isPartial  = d => { const b = bookedInfo(d); return b && !b.full; };
  const isPast     = d => d < TODAY;
  // Today is unbookable once its 9:00 AM start time has passed
  const isClosed   = d => d === TODAY && TODAY_CLOSED;

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid var(--border)' }}>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-black/10 transition"
          style={{ color: 'var(--text-secondary)' }}><ChevronLeft size={16}/></button>
        <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
          {MONTHS[view.month]} {view.year}
        </p>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-black/10 transition"
          style={{ color: 'var(--text-secondary)' }}><ChevronRight size={16}/></button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-3 pt-2.5 pb-0.5">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`}/>;
          const d = ds(day);
          const past = isPast(d), blocked = isBlocked(d), full = isFull(d), partial = isPartial(d);
          const closed = isClosed(d);
          const sel  = d === selectedDate, today = d === TODAY;
          const disabled = past || closed || blocked || full;

          let bg = 'transparent', color = 'var(--text-primary)', ring = 'transparent';
          if (sel)   { bg = 'var(--brand)'; color = 'white'; }
          else if (today) { ring = 'var(--brand)'; color = 'var(--brand)'; }
          if (disabled) color = 'var(--text-muted)';

          const dot = blocked || full ? 'bg-red-400' : partial ? 'bg-yellow-400' : null;

          return (
            <button type="button" key={d} disabled={disabled} onClick={() => onSelect(d)}
              className="relative flex items-center justify-center h-8 w-full rounded-lg text-xs font-semibold transition-all"
              style={{ background: bg, color, border: `2px solid ${ring}`,
                       cursor: disabled ? 'not-allowed' : 'pointer', opacity: past || closed ? 0.3 : 1 }}>
              {day}
              {dot && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dot}`}/>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
        {[['bg-yellow-400','1 slot left'],['bg-red-400','Fully booked / Blocked'],['bg-green-500','Available']].map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span className={`w-2 h-2 rounded-full ${cls} inline-block`}/> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Terms Confirmation Modal (pops BEFORE final submit) ───────────────────────
function TermsConfirmModal({ onAgree, onClose }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay-in" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl modal-card-in" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Terms & Conditions</h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20}/></button>
        </div>
        <div className="px-6 py-4 max-h-72 overflow-y-auto space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {[
            ['1. Scope of Service',         'Cleaning is based only on the agreed package, size, and inclusions.'],
            ['2. Property Details',          'Client must declare correct sqm, rooms, and floors to avoid issues.'],
            ['3. Manpower & Time',           'Manpower and time depend on size and dirt level; time is estimated.'],
            ['4. Client Supervision',        'Observation is allowed, but no micromanaging for smooth service.'],
            ['5. Pricing & Payment',         'Rates are final once agreed; payment after service.'],
            ['6. Satisfaction Policy',       'Concerns must be raised during cleaning, not after.'],
            ['7. Deep Cleaning Disclaimer',  'Old stains or water marks may not fully disappear.'],
            ['8. Damage & Liability',        'Not liable for pre-existing or fragile items.'],
            ['9. Garbage Policy',            'Up to 5 garbage bags only; heavy waste not included.'],
            ['10. Transportation',           'Outside Calbayog City proper has additional transport fee.'],
            ['11. Force Majeure',            'Delays due to weather or utilities are not liable.'],
            ['12. Agreement',               'Booking confirms acceptance of these terms.'],
          ].map(([title, text]) => (
            <div key={title}>
              <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</p>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-start gap-3 cursor-pointer mb-4">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 accent-green-600 w-4 h-4 shrink-0"/>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              I have read and agree to the Terms & Conditions of Z's Cleaning Services.
            </span>
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 !rounded-xl">Go Back</button>
            <button type="button" onClick={() => checked && onAgree()} disabled={!checked}
              className="btn-primary flex-1 !rounded-xl disabled:opacity-40">
              Confirm Booking →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main BookingPage ──────────────────────────────────────────────────────────
export default function BookingPage() {
  const navigate      = useNavigate();
  const locationState = useLocation().state;
  const [alertMsg, setAlertMsg] = useState(null);
  const { user }      = useAuth();

  const [services,    setServices]    = useState([]);
  const [addons,      setAddons]      = useState([]);
  const [settings,    setSettings]    = useState({});
  const [feeTable,    setFeeTable]    = useState({ defaults: {}, overrides: {} });
  const [blockedDates,setBlockedDates]= useState([]);
  const [bookedDates, setBookedDates] = useState([]);
  const [loadingSvc,  setLoadingSvc]  = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [showTerms,   setShowTerms]   = useState(false);   // terms popup before submit
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview,setReceiptPreview] = useState(null);
  const [receiptError, setReceiptError] = useState('');

  // ── Check the receipt the moment it is chosen ───────────────────────────
  // Without this the client only found out the file was rejected AFTER filling
  // in the rest of the form and waiting for the whole upload — which on phone
  // data is a long wait for a confusing failure. A photo taken of a GCash
  // screen can easily exceed 5 MB; a screenshot almost never does, so the
  // message says which to use. Same limits the server enforces.
  const pickReceipt = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';                  // allow re-picking the same file
    if (!f) return;
    setReceiptError('');

    if (!f.type.startsWith('image/')) {
      setReceiptFile(null); setReceiptPreview(null);
      return setReceiptError('Please choose an image file (JPG, PNG, WebP or GIF).');
    }
    if (f.size > 5 * 1024 * 1024) {
      setReceiptFile(null); setReceiptPreview(null);
      return setReceiptError(
        `That image is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB. ` +
        `A screenshot of your GCash receipt is usually much smaller than a photo of the screen.`
      );
    }
    setReceiptFile(f);
    setReceiptPreview(URL.createObjectURL(f));
  };
  const [qrError,     setQrError]      = useState(false);

  const [form, setForm] = useState({
    service_id:     locationState?.serviceId ? String(locationState.serviceId) : '',
    date:           '',
    location:       '',
    notes:          '',
    payment_method: 'cash',
    addon_ids:      [],
    sqm_range:      'under_100',
  });

  useEffect(() => {
    servicesAPI.list().then(r => setServices(r.data)).finally(() => setLoadingSvc(false));
    globalAddonsAPI.list().then(r => setAddons(r.data)).catch(() => {});
    settingsAPI.get().then(r => setSettings(r.data)).catch(() => {});
    transportFeesAPI.get().then(r => setFeeTable(r.data || { defaults:{}, overrides:{} })).catch(() => {});
    calendarAPI.getBlocked().then(r => setBlockedDates((r.data || []).map(d => d.date))).catch(() => {});
    calendarAPI.getBookedDates().then(r => setBookedDates(r.data || [])).catch(() => {});
  }, []);

  // Auto-fill address — runs whenever user loads (handles async user load)
  useEffect(() => {
    if (user?.address && user.address.trim() && !form.location) {
      setForm(p => ({ ...p, location: user.address }));
    }
  }, [user?.address]); // re-run whenever user.address becomes available

  const selectedService = services.find(s => s.id === parseInt(form.service_id));
  const selectedAddons  = addons.filter(a => form.addon_ids.includes(a.id));
  const addonsTotal     = selectedAddons.reduce((s, a) => s + parseFloat(a.price || 0), 0);

  // Transport fee: the admin's own figure for this barangay, falling back to
  // the municipality default. Replaces the old rule, which charged one flat
  // amount to a list of barangays hardcoded in the website's code.
  // The server recalculates this the same way when the booking is saved, so
  // what is shown here and what is charged cannot drift apart.
  const selectedMuni     = form.location.split(',')[0]?.trim() || '';
  const selectedBarangay = form.location.split(',')[1]?.trim() || '';
  const transportFee     = !form.location.trim() ? 0 : (
    feeTable.overrides?.[selectedMuni]?.[selectedBarangay] ??
    feeTable.defaults?.[selectedMuni] ?? 0
  );

  // Area surcharge — a percentage of the SERVICE price only. Add-ons are
  // priced for what they are and the transport fee depends on distance, so
  // neither is multiplied by the size of the house. The server recalculates
  // this the same way when the booking is saved.
  const basePrice = parseFloat(selectedService?.price || 0);
  // What GCash clients send to hold the booking; the rest is paid on the day.
  const reservationFee = parseFloat(settings.reservation_fee ?? 500) || 0;
  const pct100 = parseFloat(settings.surcharge_pct_100_200 ?? 100) || 0;
  const pct200 = parseFloat(settings.surcharge_pct_200_plus ?? 150) || 0;
  const areaSurcharge = form.sqm_range === '100_200'
    ? basePrice * (pct100 / 100)
    : form.sqm_range === '200_plus'
      ? basePrice * (pct200 / 100)
      : 0;

  const total = selectedService
    ? parseFloat(selectedService.price) + addonsTotal + transportFee + areaSurcharge
    : 0;

  const toggleAddon = id =>
    setForm(p => ({ ...p, addon_ids: p.addon_ids.includes(id) ? p.addon_ids.filter(i => i !== id) : [...p.addon_ids, id] }));

  // Validate everything BEFORE showing terms popup
  // Errors surface as a floating toast (visible wherever the user is on this
  // long form) and stay in the inline banner for reference after it fades.
  const failWith = (msg) => { setError(msg); setAlertMsg(msg); };

  const handleConfirmClick = (e) => {
    e.preventDefault();
    setError('');
    if (!form.service_id)      return failWith('Please select a service.');
    if (!form.date)            return failWith('Please select a date on the calendar.');
    if (!form.location.trim()) return failWith('Please enter the service location.');
    if (blockedDates.includes(form.date)) return failWith('This date is blocked. Please choose another date.');
    const full = bookedDates.find(b => b.date === form.date && b.full);
    if (full)                  return failWith('This date is fully booked. Please choose another date.');
    // The reservation holds the slot, so it is required for EVERY booking —
    // the Cash/GCash choice below only decides how the balance is settled.
    if (!receiptFile) return failWith(`Please upload your ₱${reservationFee.toLocaleString()} GCash reservation receipt.`);
    // All good — show Terms popup
    setShowTerms(true);
  };

  // Called after user agrees to Terms in the popup
  const doSubmit = async () => {
    setShowTerms(false);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('service_id',     form.service_id);
      fd.append('date',           form.date);
      fd.append('time_start',     '09:00:00');
      fd.append('location',       form.location);
      fd.append('notes',          form.notes);
      fd.append('payment_method',  form.payment_method);
      fd.append('sqm_range',       form.sqm_range);
      fd.append('area_surcharge',  String(areaSurcharge));
      fd.append('transport_fee',   String(transportFee));
      form.addon_ids.forEach(id => fd.append('addon_ids', id));
      if (receiptFile) fd.append('gcash_receipt', receiptFile);

      const { data } = await bookingsAPI.create(fd);
      navigate('/book/confirm', {
        state: {
          booking_id:     data.booking_id,
          service_name:   selectedService.name,
          service_price:  total,
          date:           form.date,
          time_start:     '9:00 AM',
          location:       form.location,
          payment_method: form.payment_method,
        },
      });
    } catch (err) {
      failWith(err.response?.data?.message || "Couldn't submit your booking — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar/>
      {/* Blocking errors surface as a centred dialog — an inline banner at the
          top of this long form is invisible to someone submitting from the
          bottom. Uses ConfirmModal's single-button alert mode. */}
      <ConfirmModal state={alertMsg ? { message: alertMsg, alert: true } : null}
        onClose={() => setAlertMsg(null)} />
      {/* Terms popup appears BEFORE final submit */}
      {showTerms && <TermsConfirmModal onAgree={doSubmit} onClose={() => setShowTerms(false)}/>}

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="eyebrow mb-1">New Booking</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Book a Service</h1>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm px-4 py-3 rounded-xl mb-5 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0 mt-0.5"/><span>{error}</span>
          </div>
        )}

        <form onSubmit={handleConfirmClick} className="space-y-4">

          {/* ① Service */}
          <div className="card">
            <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-black flex items-center justify-center">1</span>
              Choose a Service
            </h2>
            {loadingSvc ? (
              <div className="space-y-3">{[1,2,3].map(i => (
                <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--surface2)'}}/>
              ))}</div>
            ) : (
              <div className="space-y-2">
                {services.map((s, sIdx) => {
                  const sel = form.service_id === String(s.id);
                  // Same fallback logic as the homepage: original 3 services keep their
                  // hardcoded bullets; any other service uses its own "details" field.
                  // Admin-entered bullet points win; SERVICE_DETAILS is only a
                  // fallback while a service's details field is still empty.
                  const svcItems = (s.details && s.details.trim())
                    ? s.details.split('\n').map(l => l.trim()).filter(Boolean)
                    : (SERVICE_DETAILS[s.name] || []);
                  return (
                    <label key={s.id} className="flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                      style={{ borderColor: sel ? 'var(--brand)' : 'var(--border)', background: sel ? 'var(--brand-pale)' : 'var(--surface)' }}>
                      <input type="radio" name="service_id" value={s.id} checked={sel}
                        onChange={e => setForm(p => ({...p, service_id: e.target.value}))} className="mt-1 accent-green-600"/>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                          <p className="font-bold text-sm" style={{ color: 'var(--brand)' }}>₱{Number(s.price).toLocaleString()}</p>
                        </div>
                        {sel && svcItems.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {svcItems.map((item, i) => (
                              isLeadIn(item) ? (
                                <li key={i} className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{item}</li>
                              ) : (
                                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <span style={{ color: 'var(--brand)', marginTop: 1 }}>✓</span>{item}
                                </li>
                              )
                            ))}
                          </ul>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Add-ons */}
            {form.service_id && addons.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Optional Add-ons</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {addons.map(a => {
                    const checked = form.addon_ids.includes(a.id);
                    return (
                      <label key={a.id} className="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all"
                        style={{ borderColor: checked ? 'var(--brand)' : 'var(--border)', background: checked ? 'var(--brand-pale)' : 'var(--surface)' }}>
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" checked={checked} onChange={() => toggleAddon(a.id)} className="accent-green-600 w-4 h-4 shrink-0"/>
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
                        </div>
                        <span className="text-xs font-bold ml-2 shrink-0" style={{ color: 'var(--brand)' }}>
                          {parseFloat(a.price) > 0 ? `+₱${Number(a.price).toLocaleString()}` : 'Free'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ② Date Calendar */}
          <div className="card">
            <h2 className="font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-black flex items-center justify-center">2</span>
              Pick a Date
            </h2>
            <div className="flex items-center gap-1.5 mb-3 text-xs px-3 py-2 rounded-lg"
              style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
              <Info size={12} className="shrink-0"/>
              All services start at 9:00 AM. Maximum 2 bookings per day.
              {TODAY_CLOSED && ' Same-day booking is closed — today\'s 9:00 AM slot has already started.'}
            </div>
            <BookingCalendar
              selectedDate={form.date}
              onSelect={d => { setForm(p => ({...p, date: d})); setError(''); }}
              blockedDates={blockedDates}
              bookedDates={bookedDates}
            />
            {form.date && (
              <div className="mt-3 flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                <CheckCircle size={14}/>
                <span>Selected: <strong>{new Date(form.date + 'T00:00:00').toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong> · 9:00 AM</span>
              </div>
            )}
          </div>

          {/* ③ Location */}
          <div className="card">
            <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-black flex items-center justify-center">3</span>
              Location & Notes
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Service Address <span className="text-red-500">*</span></label>
                <AddressSelector value={form.location} onChange={v => setForm(p => ({...p, location: v}))} required/>
                {user?.address && user.address.trim() && form.location !== user.address && (
                  <button type="button" onClick={() => setForm(p => ({...p, location: user.address}))}
                    className="text-xs font-semibold mt-1.5 hover:underline" style={{ color: 'var(--brand)' }}>
                    ↩ Use my saved address
                  </button>
                )}
              </div>
              <div>
                <label className="label">Special Notes <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea rows={2} className="input resize-none"
                  placeholder="e.g. Gate code, areas to focus on, pets at home…"
                  value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}/>
              </div>
              <div>
                <label className="label">House / Property Size</label>
                <select className="input" value={form.sqm_range}
                  onChange={e => setForm(p => ({...p, sqm_range: e.target.value}))}>
                  <option value="under_100">Under 100 sqm — no extra charge</option>
                  {/* Shows the peso amount once a service is chosen, since the
                      surcharge depends on that service's price. */}
                  <option value="100_200">
                    100–200 sqm — +{pct100}% of the service
                    {basePrice > 0 ? ` (₱${(basePrice * pct100 / 100).toLocaleString()})` : ''}
                  </option>
                  <option value="200_plus">
                    Above 200 sqm — +{pct200}% of the service
                    {basePrice > 0 ? ` (₱${(basePrice * pct200 / 100).toLocaleString()})` : ''}
                  </option>
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Please declare the correct size to get an accurate quote.
                </p>
              </div>
              {transportFee > 0 && form.location.trim() && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300">
                  <span className="shrink-0">🚗</span>
                  <span>
                    <strong>Transportation fee applies:</strong> A ₱{transportFee.toLocaleString()} transport
                    fee has been added for {selectedBarangay ? `${selectedBarangay}, ` : ''}{selectedMuni}.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ④ Payment */}
          <div className="card">
            <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-black flex items-center justify-center">4</span>
              Payment
            </h2>
            {/* Always shown: no reservation, no booking. */}
            {(
              <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Reservation Payment <span className="text-red-500">*</span>
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  {settings.gcash_qr_url && settings.gcash_qr_url.trim() && !qrError ? (
                    <img src={settings.gcash_qr_url} alt="GCash QR" className="w-32 h-32 object-contain rounded-xl bg-white p-1 shrink-0"
                      style={{ border: '1px solid var(--border)' }}
                      onError={() => setQrError(true)}/>
                  ) : (
                    <div className="w-32 h-32 rounded-xl flex items-center justify-center text-xs text-center p-3 shrink-0"
                      style={{ border: '2px dashed var(--border)', color: 'var(--text-muted)' }}>
                      📱<br/>QR Code<br/>not yet uploaded
                    </div>
                  )}
                  <div className="flex-1 space-y-2 text-sm">
                    <p style={{ color: 'var(--text-secondary)' }}>Send payment to:</p>
                    <div className="px-3 py-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                        {settings.gcash_name && settings.gcash_name.trim() ? settings.gcash_name : "Z's Cleaning Services"}
                      </p>
                      <p className="font-bold text-lg mt-0.5" style={{ color: 'var(--brand)' }}>
                        {settings.gcash_number && settings.gcash_number.trim() ? settings.gcash_number : '0916-213-3460'}
                      </p>
                    </div>
                    {/* GCash holds the booking with a reservation; the rest is
                        settled with the service, so the client is told both
                        figures instead of being asked for the full amount. */}
                    {/* The reservation is always shown, even before a service is
                        chosen, because it is the amount to send right now. The
                        balance line appears once there is a total to work from. */}
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Send now:{' '}
                      <strong style={{ color: 'var(--brand)', fontSize: 15 }}>₱{reservationFee.toLocaleString()}</strong>
                      {' '}reservation
                    </p>
                    {total > reservationFee && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Balance of ₱{(total - reservationFee).toLocaleString()} is paid on the day of service
                        ({form.payment_method === 'gcash' ? 'GCash' : 'Cash'}).
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="label">
                    Upload ₱{reservationFee.toLocaleString()} GCash Receipt <span className="text-red-500">*</span>
                  </label>
                  <input type="file" accept="image/*" onChange={pickReceipt}
                    className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}/>
                  {receiptError && (
                    <p className="mt-2 text-xs font-medium text-red-600">{receiptError}</p>
                  )}
                  {receiptPreview && <img src={receiptPreview} alt="Receipt" className="mt-3 rounded-xl max-h-48 object-contain" style={{ border: '1px solid var(--border)' }}/>}
                </div>
              </div>
            )}

            {/* Asked AFTER the reservation, because the reservation is what
                actually confirms the booking; this only covers what is left. */}
            <p className="text-sm mt-5 mb-1 font-semibold" style={{ color: 'var(--text-primary)' }}>
              How will you pay the balance?
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              The rest is settled on the day of service, after we have checked the property.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { val:'cash',  label:'Cash',  Icon:Banknote,   desc:'On the day of service' },
                { val:'gcash', label:'GCash', Icon:CreditCard, desc:'On the day of service' },
              ].map(({ val, label, Icon, desc }) => (
                <label key={val} className="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
                  style={{ borderColor: form.payment_method===val ? 'var(--brand)' : 'var(--border)', background: form.payment_method===val ? 'var(--brand-pale)' : 'var(--surface)' }}>
                  <input type="radio" name="payment_method" value={val} checked={form.payment_method===val}
                    onChange={e => setForm(p=>({...p, payment_method: e.target.value}))} className="sr-only"/>
                  <Icon size={18} style={{ color: form.payment_method===val ? 'var(--brand)' : 'var(--text-muted)' }}/>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                </label>
              ))}
            </div>

          </div>

          {/* ⑤ Summary + Confirm button */}
          {selectedService && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--panel-dark)' }}>
              <div className="px-5 py-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{selectedService.name}</span>
                  <span className="text-white">₱{Number(selectedService.price).toLocaleString()}</span>
                </div>
                {selectedAddons.map(a => (
                  <div key={a.id} className="flex justify-between">
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>+ {a.name}</span>
                    <span className="text-white">{parseFloat(a.price)>0 ? `₱${Number(a.price).toLocaleString()}` : 'Free'}</span>
                  </div>
                ))}
                {areaSurcharge > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Area surcharge ({form.sqm_range === '100_200' ? '100–200 sqm' : 'Above 200 sqm'})</span>
                    <span className="text-white">₱{areaSurcharge.toLocaleString()}</span>
                  </div>
                )}
                {transportFee > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>🚗 Transportation fee</span>
                    <span className="text-white">₱{transportFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="font-bold text-white">Estimated Total</span>
                  <span className="font-extrabold text-lg" style={{ color: 'var(--brand-bright)' }}>₱{total.toLocaleString()}</span>
                </div>
                {/* The area charge is based on the size the client declares, and
                    the business checks the property before the cleaning day. So
                    this figure is a quote, and the form says so rather than
                    letting the client be surprised later. */}
                <p className="text-xs pt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  This is an estimate based on the details you entered. We will check the property
                  before your service date, and the final total may change if the house size is
                  different. Any change is shown in My Bookings with the reason.
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* ── Sticky bottom bar — always visible once service is selected ────────
          Primary action stays in view while user fills out the form steps.
          Hides when no service chosen (nothing to submit yet). */}
      {selectedService && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 sm:px-6"
          style={{
            background: 'var(--panel-dark)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
          }}>
          <div className="max-w-2xl mx-auto flex items-center gap-4">
            {/* Running total — at a glance */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {selectedService.name}{selectedAddons.length > 0 ? ` + ${selectedAddons.length} add-on${selectedAddons.length > 1 ? 's' : ''}` : ''}
              </p>
              <p className="font-extrabold text-lg leading-none mt-0.5" style={{ color: 'var(--brand-bright)' }}>
                ₱{total.toLocaleString()}
                {/* Matches the summary above — the running figure is a quote too. */}
                <span className="font-semibold text-[10px] ml-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>est.</span>
              </p>
            </div>
            {/* Single dominant CTA */}
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmClick}
              className="shrink-0 px-8 py-3.5 rounded-2xl font-bold text-white text-sm flex items-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'var(--brand)', minWidth: 180 }}>
              {submitting
                ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>Submitting…</>
                : <>Review & Confirm <ChevronRight size={16}/></>
              }
            </button>
          </div>
        </div>
      )}
      {/* Bottom padding so sticky bar doesn't cover last form element */}
      {selectedService && <div className="h-24"/>}
    </div>
  );
}
