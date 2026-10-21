import { useEffect, useState } from 'react';
import { Search, Eye, XCircle, CheckCircle, RefreshCw, DollarSign, AlertTriangle, ClipboardList, Plus } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import AddressSelector from '../../components/AddressSelector.jsx';
import { localDate } from '../../utils/localDate.js';
import { bookingsAPI, paymentsAPI, calendarAPI, clientsAPI, servicesAPI, globalAddonsAPI, settingsAPI, transportFeesAPI, receiptSrc } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.jsx';
import { usePolling } from '../../hooks/usePolling.jsx';

const STATUSES = ['all','pending','confirmed','done','completed','cancelled'];
const BADGE = {
  pending:            'badge-pending',
  confirmed:          'badge-confirmed',
  done:               'badge-done',
  completed:          'badge-done',
  pending_reschedule: 'badge-pending',
  cancelled:          'badge-cancelled',
};

const TODAY = localDate();
const TIME_SLOTS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];


// ── Reschedule calendar ───────────────────────────────────────────────────────
// Mirrors the client booking calendar's visual language so availability is
// visible BEFORE a date is chosen: blocked and full days are disabled with a
// red dot, days with one slot left carry an amber dot. A bare <input
// type="date"> gave the admin no way to see any of this — she had to pick a
// date and then be told it was unusable.
function RescheduleCalendar({ selectedDate, onSelect, blockedDates, dayCounts }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const ds = (day) =>
    `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const blockedOn = (d) => blockedDates.find(b => b.date === d);
  const countOn   = (d) => dayCounts[d] || 0;

  const shift = (n) => setView(v => {
    const m = v.month + n;
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <button type="button" onClick={() => shift(-1)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>‹</button>
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          {MONTHS[view.month]} {view.year}
        </span>
        <button type="button" onClick={() => shift(1)} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}>›</button>
      </div>

      <div className="grid grid-cols-7 px-3 pt-2">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[9px] font-bold py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`}/>;
          const d = ds(day);
          const past    = d < TODAY;
          const blocked = !!blockedOn(d);
          const count   = countOn(d);
          const full    = count >= 2;
          const partial = count === 1;
          const disabled = past || blocked || full;
          const sel   = d === selectedDate;
          const today = d === TODAY;

          let bg = 'transparent', color = 'var(--text-primary)', ring = 'transparent';
          if (sel)        { bg = 'var(--brand)'; color = 'white'; }
          else if (today) { ring = 'var(--brand)'; color = 'var(--brand)'; }
          if (disabled)   color = 'var(--text-muted)';

          const dot = blocked || full ? 'bg-red-400' : partial ? 'bg-yellow-400' : null;

          return (
            <button type="button" key={d} disabled={disabled} onClick={() => onSelect(d)}
              title={blocked ? (blockedOn(d).reason || 'Blocked') : full ? 'Fully booked' : partial ? '1 slot left' : ''}
              className="relative flex items-center justify-center h-8 w-full rounded-lg text-xs font-semibold transition-all"
              style={{ background: bg, color, border: `2px solid ${ring}`,
                       cursor: disabled ? 'not-allowed' : 'pointer', opacity: past ? 0.3 : 1 }}>
              {day}
              {dot && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dot}`}/>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 px-3 pb-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400"/>1 slot left</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400"/>Full / Blocked</span>
      </div>
    </div>
  );
}

export default function AdminBookings() {
  const { showToast } = useToast();
  const [bookings,   setBookings]   = useState([]);
  // Blocked dates, so the reschedule picker can tell the admin a date is
  // unavailable BEFORE she submits. The server enforces the rule either way;
  // this is so she isn't guessing.
  const [blockedDates, setBlockedDates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [filter,     setFilter]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null);
  const [imgModal,   setImgModal]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Recording money that arrives after the booking was created
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount,   setPayAmount]   = useState('');

  // Turning down a GCash receipt that does not check out
  const [showReject,   setShowReject]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // House size corrected after the ocular inspection
  const [showSizeEdit, setShowSizeEdit] = useState(false);
  const [sizeRange,    setSizeRange]    = useState('under_100');
  const [sizeCharge,   setSizeCharge]   = useState('');   // blank = use the % rule
  const [priceNote,    setPriceNote]    = useState('');

  // Reschedule form
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate,  setNewDate]  = useState('');
  const [newTime,  setNewTime]  = useState('09:00');

  // Column sorting
  const [sortBy,  setSortBy]  = useState('date');   // 'date' | 'total' | 'status'
  const [sortDir, setSortDir] = useState('desc');    // 'asc' | 'desc'

  // Bulk selection — only used when filter === 'pending' for bulk-confirm
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // `quiet` is used by the auto-refresh below: it fetches without switching
  // the page back to its loading skeletons, so the list updates in place
  // instead of flickering every 20 seconds.
  const load = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      setLoadError(false);
      const res = await bookingsAPI.getAll();
      setBookings(res.data || []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  // New bookings appear on their own while this page is open. Paused while the
  // tab is hidden, and refreshed the moment the admin comes back to it.
  usePolling(() => load(true), 20000);
  useEffect(() => {
    calendarAPI.getBlocked()
      .then(r => setBlockedDates((r.data || []).map(b => ({
        date: String(b.date).slice(0, 10), reason: b.reason,
      }))))
      .catch(() => {});
  }, []);

  // ── Walk-in / phone booking ──
  // Clients still call to book; this records the call directly rather than
  // sending the caller online, which is the manual process the system replaces.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    mode: 'existing', client_id: '', new_name: '', new_phone: '', new_email: '',
    service_id: '', date: '', time_start: '09:00:00', location: '',
    sqm_range: 'under_100', payment_method: 'cash', notes: '', addon_ids: [],
    // Ticked when the caller has already sent the reservation. Off by default:
    // most callers have not paid anything at the moment the admin types this in.
    reservation_paid: false,
  });
  const [clients,  setClients]  = useState([]);
  const [services, setServices] = useState([]);
  const [addons,   setAddons]   = useState([]);
  const [settings, setSettings] = useState({});
  const [feeTable, setFeeTable] = useState({ defaults: {}, overrides: {} });
  const [addErr,   setAddErr]   = useState('');

  useEffect(() => {
    if (!showAdd) return;
    clientsAPI.list().then(r => setClients(r.data || [])).catch(() => {});
    servicesAPI.list().then(r => setServices(r.data || [])).catch(() => {});
    globalAddonsAPI.list().then(r => setAddons(r.data || [])).catch(() => {});
  }, [showAdd]);

  // Charges are needed by the booking detail too (the house-size panel shows
  // what each size costs), so they load on mount rather than only when the
  // Add Booking form is opened.
  useEffect(() => {
    settingsAPI.get().then(r => setSettings(r.data || {})).catch(() => {});
    transportFeesAPI.get().then(r => setFeeTable(r.data || { defaults:{}, overrides:{} })).catch(() => {});
  }, []);

  // Fees mirror the client booking page so a phone booking is quoted the same
  // as an online one.
  const addService = services.find(s => String(s.id) === String(addForm.service_id));
  // A percentage of the service price only — same rule as the client page.
  const addBasePrice = parseFloat(addService?.price || 0);
  const addPct100 = parseFloat(settings.surcharge_pct_100_200 ?? 100) || 0;
  const addPct200 = parseFloat(settings.surcharge_pct_200_plus ?? 150) || 0;
  const addSurcharge = addForm.sqm_range === '100_200'
    ? addBasePrice * (addPct100 / 100)
    : addForm.sqm_range === '200_plus'
      ? addBasePrice * (addPct200 / 100)
      : 0;
  // Transport fee is DERIVED from the chosen barangay, never ticked by hand —
  // identical rule to the client booking page. A manual checkbox could be
  // forgotten, silently undercharging the customer.
  const addMuni     = addForm.location.split(',')[0]?.trim() || '';
  const addBarangay = addForm.location.split(',')[1]?.trim() || '';
  // Reads the admin's own per-barangay fee table, the same one the client
  // booking page and the server use.
  const addTransport = !addForm.location.trim() ? 0 : (
    feeTable.overrides?.[addMuni]?.[addBarangay] ?? feeTable.defaults?.[addMuni] ?? 0
  );
  const addOutside  = addTransport > 0;
  const addAddonTotal = addons
    .filter(a => addForm.addon_ids.includes(a.id))
    .reduce((sum, a) => sum + parseFloat(a.price || 0), 0);
  const addTotal = (parseFloat(addService?.price || 0)) + addAddonTotal + addSurcharge + addTransport;

  const submitAdminBooking = async () => {
    setAddErr('');
    if (addForm.mode === 'existing' && !addForm.client_id) return setAddErr('Select a client.');
    if (addForm.mode === 'new' && !addForm.new_name.trim()) return setAddErr("Enter the caller's name.");
    if (!addForm.service_id) return setAddErr('Select a service.');
    if (!addForm.date)       return setAddErr('Select a date.');
    if (!addForm.location.trim()) return setAddErr('Enter the service location.');
    const issue = rescheduleIssue(addForm.date);
    if (issue) return setAddErr(issue);
    try {
      setSubmitting(true);
      const { data } = await bookingsAPI.adminCreate({
        client_id: addForm.mode === 'existing' ? addForm.client_id : null,
        new_client: addForm.mode === 'new'
          ? { name: addForm.new_name, phone: addForm.new_phone, email: addForm.new_email }
          : null,
        service_id: addForm.service_id,
        date: addForm.date,
        time_start: addForm.time_start,
        location: addForm.location,
        notes: addForm.notes,
        payment_method: addForm.payment_method,
        sqm_range: addForm.sqm_range,
        area_surcharge: addSurcharge,
        transport_fee: addTransport,
        addon_ids: addForm.addon_ids,
        // Always the reservation from settings: that is the only amount a
        // caller sends at this point. Anything else — an advance payment, or
        // money arriving later — goes through Record a Payment on the booking,
        // so the exception does not sit on a form used for every booking.
        reservation_paid: addForm.reservation_paid,
      });
      showToast(data.message || 'Booking created.', 'success');
      setShowAdd(false);
      setAddForm(f => ({ ...f, client_id: '', new_name: '', new_phone: '', new_email: '',
        service_id: '', date: '', location: '', notes: '', addon_ids: [] }));
      load();
    } catch (e) {
      setAddErr(e.response?.data?.message || "Couldn't create the booking — try again.");
    } finally { setSubmitting(false); }
  };

  // Active bookings per date, excluding the one being moved — otherwise a
  // booking would count against the capacity of its own date.
  const dayCounts = bookings.reduce((acc, b) => {
    if (!['pending', 'confirmed'].includes(b.status)) return acc;
    if (b.id === selected?.id) return acc;
    const d = String(b.date).slice(0, 10);
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  // Why a proposed reschedule date can't be used — mirrors the server rule in
  // booking-controller.dateUnavailableReason so the UI and API agree.
  const rescheduleIssue = (dateStr) => {
    if (!dateStr) return null;
    const blocked = blockedDates.find(b => b.date === dateStr);
    if (blocked)
      return blocked.reason
        ? `This date is blocked (${blocked.reason}). Unblock it first to schedule on it.`
        : 'This date is blocked. Unblock it first to schedule on it.';
    const taken = bookings.filter(b =>
      String(b.date).slice(0, 10) === dateStr &&
      ['pending', 'confirmed'].includes(b.status) &&
      b.id !== selected?.id
    ).length;
    if (taken >= 2) return 'This date is already fully booked (max 2 services per day).';
    return null;
  };

  const filtered = bookings.filter(b => {
    const matchStatus = filter === 'all' || b.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || b.client_name?.toLowerCase().includes(q)
      || b.service_name?.toLowerCase().includes(q)
      || String(b.id).includes(q);
    return matchStatus && matchSearch;
  });

  // Column sorting — applied after filter/search, does not mutate original array.
  // Uses the server's authoritative total_price (service + add-ons + area
  // surcharge + transport fee). Never recompute the total here: a second
  // formula is how the admin view and the client's receipt drifted apart.
  const totalNum = (b) => parseFloat(b.total_price || b.service_price || 0);
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'date')   cmp = new Date(a.date) - new Date(b.date);
    if (sortBy === 'total')  cmp = totalNum(a) - totalNum(b);
    if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  // Bulk confirm — only applies to currently-visible pending bookings
  const toggleSelectAll = () => {
    const pendingIds = sorted.filter(b => b.status === 'pending').map(b => b.id);
    setSelectedIds(prev => prev.length === pendingIds.length ? [] : pendingIds);
  };
  const toggleSelectOne = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const bulkConfirm = async () => {
    if (selectedIds.length === 0) return;
    try {
      setBulkSubmitting(true);
      await Promise.all(selectedIds.map(id => bookingsAPI.updateStatus(id, 'confirmed')));
      showToast(`${selectedIds.length} booking(s) confirmed.`, 'success');
      setSelectedIds([]);
      load();
    } catch {
      showToast("Couldn't confirm some bookings — refresh and try again.", 'error');
    } finally { setBulkSubmitting(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      setSubmitting(true);
      await bookingsAPI.updateStatus(id, status);
      showToast(`Booking #${id} marked as ${status}.`, 'success');
      load();
      setSelected(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the status — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const markPaymentReceived = async (booking) => {
    try {
      setSubmitting(true);
      // Record what is still OWED, not the full total — a booking with a ₱500
      // reservation already recorded must not be charged the whole amount again.
      const owed = Math.max(0,
        (parseFloat(booking.total_price || booking.service_price || 0) || 0)
        - (parseFloat(booking.amount_paid || 0) || 0)
      );
      const { data } = await paymentsAPI.record({
        booking_id: booking.id,
        amount: owed,
        method: booking.payment_method || 'Cash',
      });
      // The server derives unpaid / partial / paid and settles a performed job
      // only once the total is covered, so no separate status call is needed.
      showToast(data?.message || `Payment recorded for booking #${booking.id}.`, 'success');
      load();
      setSelected(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't record the payment — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const doRecordPayment = async () => {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0)
      return showToast('Enter the amount received.', 'error');
    try {
      setSubmitting(true);
      const { data } = await paymentsAPI.record({
        booking_id: selected.id,
        amount,
        method: selected.payment_method === 'gcash' ? 'GCash' : 'Cash',
      });
      // The server works out unpaid / partial / paid from the total received,
      // and settles a performed job only once the whole amount is in.
      showToast(data?.message || 'Payment recorded.', 'success');
      setShowPayment(false);
      setSelected(null);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't record the payment — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const doSetHouseSize = async () => {
    try {
      setSubmitting(true);
      const { data } = await bookingsAPI.setHouseSize(selected.id, {
        sqm_range: sizeRange,
        // Left blank, the server applies the percentage for that size.
        area_surcharge: sizeCharge === '' ? undefined : Number(sizeCharge),
        price_note: priceNote,
      });
      showToast(data?.message || 'House size updated.', 'success');
      setShowSizeEdit(false);
      setSelected(null);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't update the house size — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const verifyGcash = async (id) => {
    try {
      setSubmitting(true);
      // No amount sent: the server records the reservation fee from settings.
      const { data } = await bookingsAPI.verifyGcash(id);
      showToast(data?.message || `GCash payment for #${id} verified.`, 'success');
      load();
      setSelected(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't verify the GCash payment — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  // Rejecting a receipt. The reason is required: it is what the client is shown
  // and emailed, so they know what to fix instead of being left guessing.
  const doRejectGcash = async () => {
    const reason = rejectReason.trim();
    if (!reason) return showToast('Please say why the receipt was rejected.', 'error');
    try {
      setSubmitting(true);
      const { data } = await bookingsAPI.rejectGcash(selected.id, reason);
      showToast(data?.message || 'Receipt rejected.', 'success');
      setShowReject(false);
      setRejectReason('');
      load();
      setSelected(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't reject the receipt — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  // The way out when the receipts keep failing. Cancelling frees the date,
  // which a rejected booking no longer holds anyway.
  const doCancelRejected = async (id) => {
    if (!window.confirm(
      'Cancel this booking?\n\nThe client is told it was cancelled and can book again. ' +
      'This cannot be undone.'
    )) return;
    try {
      setSubmitting(true);
      const { data } = await bookingsAPI.cancelRejected(id);
      showToast(data?.message || 'Booking cancelled.', 'success');
      load();
      setSelected(null);
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't cancel the booking — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const doReschedule = async () => {
    if (!newDate || !newTime) return showToast('Please select a date and time.', 'error');
    try {
      setSubmitting(true);
      await bookingsAPI.reschedule(selected.id, { date: newDate, time_start: newTime + ':00' });
      showToast(`Booking #${selected.id} rescheduled to ${newDate} at ${newTime}.`, 'success');
      setShowReschedule(false);
      setSelected(null);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || "Couldn't send the reschedule — try again.", 'error');
    } finally { setSubmitting(false); }
  };

  const fmt = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  const fmtDateTime = (d, t) => {
    if (!d) return '—';
    return `${fmt(d)} ${t || '09:00'}`;
  };

  // Walk-in clients booked by phone may have no email, so the server stores a
  // placeholder on the reserved .invalid domain to satisfy the UNIQUE NOT NULL
  // constraint. It is internal plumbing and must never be shown — fall back to
  // the phone number, or say plainly that there is no email.
  const contactOf = (b) => {
    const e = String(b.client_email || '');
    if (e && !e.endsWith('@zclean.invalid')) return e;
    return b.client_phone || 'No email on file';
  };

  const totalPHP = (b) => {
    const t = parseFloat(b.total_price || b.service_price || 0);
    return isNaN(t) ? '—' : `₱${t.toLocaleString()}`;
  };

  // Money position of the booking currently open in the detail panel. Derived
  // from the amount_paid the server sends with every booking, so it can never
  // disagree with the payments table.
  const selTotal   = parseFloat(selected?.total_price || selected?.service_price || 0) || 0;
  const selPaid    = parseFloat(selected?.amount_paid || 0) || 0;
  const selBalance = Math.max(0, Math.round((selTotal - selPaid) * 100) / 100);

  // ── When each action is allowed ──────────────────────────────────────────
  // The buttons follow the real order of work, so the admin cannot do
  // something out of sequence: promise a slot for money nobody has checked, or
  // mark a job done before the day it happens. Anything merely EARLY or
  // correctable stays open — a reservation normally arrives days before the
  // service, and a mistyped house size has to be fixable.
  const selDate       = String(selected?.date || '').slice(0, 10);
  const serviceDayUp  = !!selDate && selDate <= TODAY;   // the day has arrived
  const receiptWaiting = selected?.payment_status === 'pending_verification';
  const fullyPaid      = selected?.payment_status === 'paid';
  // Recording the balance is the main thing left to do on a performed job, so
  // there it is the primary button rather than a secondary one.
  const payIsPrimary   = selected?.status === 'done' && !fullyPaid && !receiptWaiting;

  // Opens the payment panel with the balance already filled in: one tap for
  // the usual case, editable for a part payment.
  // The box opens with whichever amount is likely at this stage — and, where
  // the two differ, the one that does less damage if it is wrong.
  //
  // Before the service, the payment that normally arrives is the reservation.
  // Pre-filling the full balance there would be one careless tap away from
  // recording money nobody sent: the booking would read as paid, settle to
  // completed, and land in the revenue report as income that does not exist —
  // with nothing on screen looking wrong. A ₱500 default that should have been
  // the full amount leaves an obvious balance instead, which gets noticed and
  // corrected. After the job is done, the balance IS the expected payment, so
  // that becomes the default.
  // Exactly two amounts exist in this business, so the panel never asks:
  //   • the ₱500 reservation, when nothing has been received yet and the
  //     service has not happened;
  //   • the remaining balance, otherwise — paid in full on the day.
  const reservationFee = Number(settings.reservation_fee ?? 500) || 0;
  // Nothing received yet, the service has not happened, and the booking is not
  // already settled. `fullyPaid` is checked explicitly: a paid booking must
  // never offer to take more money, whatever the other figures say.
  const payIsReservation =
    selPaid === 0 && !fullyPaid && selected?.status !== 'done' &&
    reservationFee > 0 && reservationFee < selBalance;
  const payDue = payIsReservation ? reservationFee : selBalance;

  const openPaymentPanel = () => {
    setPayAmount(String(payDue));
    setShowPayment(true);
  };

  // A short grey line under a disabled button explaining why it is disabled —
  // so the admin learns the order of work instead of wondering what is broken.
  const Why = ({ children }) => (
    <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>{children}</p>
  );

  // Stats
  const counts = { pending: 0, confirmed: 0, done: 0, completed: 0, cancelled: 0 };
  bookings.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });

  return (
    <AdminLayout title="Bookings">
      <div className="space-y-5 max-w-6xl mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Pending',   value: counts.pending,   tw: 'text-yellow-700 dark:text-yellow-400', ring: '#d97706', hint: 'awaiting confirmation' },
            { label: 'Confirmed', value: counts.confirmed, tw: 'text-blue-700   dark:text-blue-400',   ring: '#2563eb', hint: 'scheduled work' },
            // The point of the done/completed split: 'Done' is money owed.
            { label: 'Done',      value: counts.done,      tw: 'text-amber-700  dark:text-amber-400',  ring: '#b45309', hint: 'payment pending' },
            { label: 'Completed', value: counts.completed, tw: 'text-green-700  dark:text-green-400',  ring: '#16a34a', hint: 'performed & paid' },
            { label: 'Cancelled', value: counts.cancelled, tw: 'text-gray-500   dark:text-gray-400',   ring: '#6b7280', hint: '' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center cursor-pointer transition-all hover:shadow-md"
              onClick={() => setFilter(s.label.toLowerCase())}
              style={{ border: filter === s.label.toLowerCase() ? `2px solid ${s.ring}` : '' }}>
              <p className={`text-2xl font-black ${s.tw}`}>{s.value}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{s.label}</p>
              {s.hint && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.hint}</p>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Record a booking taken by phone or in person */}
          <button onClick={() => setShowAdd(true)}
            className="btn-primary text-sm flex items-center gap-1.5 shrink-0">
            <Plus size={15}/> New Booking
          </button>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input className="input pl-9 text-sm" placeholder="Search client, service, #ID…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold capitalize border transition-all"
                style={{
                  background:  filter === s ? 'var(--brand)' : 'transparent',
                  color:       filter === s ? 'white' : 'var(--text-muted)',
                  borderColor: filter === s ? 'var(--brand)' : 'var(--border)',
                }}>
                {s === 'all' ? `All (${bookings.length})` : `${s} (${counts[s] ?? 0})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--surface2)' }} />)}
            </div>
          ) : loadError ? (
            <div className="text-center py-16">
              <AlertTriangle size={36} className="mx-auto mb-2" style={{ color: '#dc2626' }}/>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn't load bookings</p>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Check that the server is running, then try again.</p>
              <button onClick={load} className="btn-primary">Retry</button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList size={36} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }}/>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No bookings found.</p>
            </div>
          ) : (
            <div>
              {/* Bulk action bar — only shows when pending bookings are selected */}
              {selectedIds.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 mb-2 rounded-xl"
                  style={{ background: 'var(--brand-pale)', border: '1px solid var(--brand)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                    {selectedIds.length} selected
                  </span>
                  <button onClick={bulkConfirm} disabled={bulkSubmitting}
                    className="btn-primary text-xs !py-1.5 !px-4 flex items-center gap-1.5">
                    <CheckCircle size={13}/> {bulkSubmitting ? 'Confirming…' : 'Confirm Selected'}
                  </button>
                </div>
              )}

              {/* ── Mobile: stacked cards (no horizontal scroll needed) ── */}
              <div className="sm:hidden space-y-3">
                {sorted.map(b => (
                  <div key={b.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {b.status === 'pending' && (
                          <input type="checkbox" aria-label={`Select booking ${b.id}`}
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleSelectOne(b.id)}
                            className="accent-[var(--brand)] mt-1 shrink-0"/>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{b.client_name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{contactOf(b)}</p>
                        </div>
                      </div>
                      <span className={`badge ${BADGE[b.status] || 'badge-info'} text-xs shrink-0`}>{b.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-mono">#{b.id}</span>
                      <span className="capitalize">{b.payment_method}</span>
                    </div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{b.service_name}</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(b.date, b.time_start)}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base" style={{ color: 'var(--brand)' }}>{totalPHP(b)}</span>
                      <button onClick={() => { setSelected(b); setShowReschedule(false); setNewDate(''); setNewTime('09:00'); }}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ color: 'var(--brand)', background: 'var(--brand-pale)' }}>
                        <Eye size={13} /> View
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Desktop/tablet: table (unchanged) ── */}
              <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {/* Select-all checkbox — only meaningful when viewing pending bookings */}
                    <th className="px-4 py-3 w-8">
                      {filter === 'pending' && sorted.some(b => b.status === 'pending') && (
                        <input type="checkbox" aria-label="Select all pending bookings"
                          checked={selectedIds.length > 0 && selectedIds.length === sorted.filter(b => b.status === 'pending').length}
                          onChange={toggleSelectAll}
                          className="accent-[var(--brand)]"/>
                      )}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>#</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>Client</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>Service</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide cursor-pointer select-none"
                      style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('date')}>
                      Date & Time {sortBy === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}>Payment</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide cursor-pointer select-none"
                      style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('total')}>
                      Total {sortBy === 'total' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide cursor-pointer select-none"
                      style={{ color: 'var(--text-muted)' }} onClick={() => toggleSort('status')}>
                      Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--text-muted)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(b => (
                    <tr key={b.id} className="border-b transition-colors hover:bg-[var(--surface2)]"
                      style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3">
                        {b.status === 'pending' && (
                          <input type="checkbox" aria-label={`Select booking ${b.id}`}
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleSelectOne(b.id)}
                            className="accent-[var(--brand)]"/>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>#{b.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{b.client_name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{contactOf(b)}</p>
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>{b.service_name}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {fmtDateTime(b.date, b.time_start)}
                      </td>
                      <td className="px-4 py-3 capitalize text-xs" style={{ color: 'var(--text-muted)' }}>{b.payment_method}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: 'var(--brand)' }}>{totalPHP(b)}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${BADGE[b.status] || 'badge-info'} text-xs`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelected(b); setShowReschedule(false); setNewDate(''); setNewTime('09:00'); }}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ color: 'var(--brand)', background: 'var(--brand-pale)' }}>
                          <Eye size={13} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail / Action Modal ─────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4 modal-overlay-in"
          onClick={() => { setSelected(null); setShowReschedule(false); }}>
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto modal-card-in"
            style={{ background: 'var(--surface)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Booking #{selected.id}</h2>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`badge ${BADGE[selected.status] || 'badge-info'} text-xs`}>{selected.status}</span>
                  {/* Payment axis, shown separately from the service axis */}
                  {selected.status !== 'cancelled' && (() => {
                    const pay = selected.payment_status === 'paid'
                      ? { text: 'Paid', bg: '#dcfce7', fg: '#166534' }
                      : selected.payment_method === 'gcash' && selected.gcash_receipt
                        ? { text: 'Receipt pending review', bg: '#dbeafe', fg: '#1d4ed8' }
                        : { text: 'Unpaid', bg: '#fef3c7', fg: '#b45309' };
                    return (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: pay.bg, color: pay.fg }}>
                        {pay.text}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <button onClick={() => { setSelected(null); setShowReschedule(false); }}
                style={{ color: 'var(--text-muted)' }}><XCircle size={20} /></button>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-3 text-sm">
              <Row label="Client"   value={`${selected.client_name} · ${contactOf(selected)}`} />
              <Row label="Phone"    value={selected.client_phone || '—'} />
              <Row label="Service"  value={selected.service_name} />
              <Row label="Date"     value={fmtDateTime(selected.date, selected.time_start)} />
              <Row label="Location" value={selected.location} />
              {selected.notes && <Row label="Notes" value={selected.notes} />}
              <Row label="Payment"  value={<span className="capitalize">{selected.payment_method}</span>} />
              <Row label="Pay Status" value={
                <span style={{ color: selected.payment_status === 'paid' ? 'var(--brand)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {selected.payment_status || 'unpaid'}
                </span>
              } />
              {/* Itemised breakdown — mirrors the client's receipt line for line,
                  so the admin can explain any charge without recomputing it. */}
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface2)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{selected.service_name}</span>
                  <span style={{ color: 'var(--text-primary)' }}>₱{Number(selected.service_price || 0).toLocaleString()}</span>
                </div>
                {selected.addons_summary && (
                  <div className="flex justify-between text-sm gap-3">
                    <span style={{ color: 'var(--text-secondary)' }}>Add-ons: {selected.addons_summary}</span>
                    <span className="shrink-0" style={{ color: 'var(--text-primary)' }}>
                      ₱{(
                        parseFloat(selected.total_price || 0)
                        - parseFloat(selected.service_price || 0)
                        - parseFloat(selected.area_surcharge || 0)
                        - parseFloat(selected.transport_fee || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {parseFloat(selected.area_surcharge || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Area surcharge{selected.sqm_range ? ` (${String(selected.sqm_range).replace(/_/g, ' ')})` : ''}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>₱{Number(selected.area_surcharge).toLocaleString()}</span>
                  </div>
                )}
                {parseFloat(selected.transport_fee || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Transport fee</span>
                    <span style={{ color: 'var(--text-primary)' }}>₱{Number(selected.transport_fee).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {selected.priced_at ? 'Final total' : 'Estimated total'}
                  </span>
                  <span className="font-bold text-base" style={{ color: 'var(--brand)' }}>{totalPHP(selected)}</span>
                </div>
                {/* Why the agreed price differs from the estimate. */}
                {selected.priced_at && selected.price_note && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    After inspection: {selected.price_note}
                  </p>
                )}
                {/* Paid / balance — only once something has been received, so a
                    booking with no payment yet looks exactly as before. */}
                {selPaid > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--text-secondary)' }}>Amount paid</span>
                      <span style={{ color: 'var(--text-primary)' }}>₱{selPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span style={{ color: 'var(--text-primary)' }}>Balance</span>
                      <span style={{ color: selBalance > 0 ? '#b45309' : 'var(--brand)' }}>
                        ₱{selBalance.toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* A receipt that was turned down. Shown so the admin can see
                  what was said to the client, and so a booking sitting idle is
                  explained rather than looking stuck. */}
              {selected.payment_status === 'rejected' && (
                <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                  <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                  <span>
                    <strong>Receipt rejected.</strong>{' '}
                    {selected.receipt_rejected_reason || 'No reason recorded.'}
                    {' '}Waiting for the client to upload a new one. This booking no
                    longer holds the date.
                  </span>
                </div>
              )}

              {/* If the receipts keep failing, this ends it. Shown only on a
                  rejected booking — ordinary cancellation stays unavailable. */}
              {selected.payment_status === 'rejected' && selected.status !== 'cancelled' && (
                <button type="button" disabled={submitting}
                  onClick={() => doCancelRejected(selected.id)}
                  className="btn-secondary w-full !py-2 text-xs flex items-center justify-center gap-1.5"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
                  <XCircle size={13} /> Cancel this booking
                </button>
              )}

              {/* The GCash reference the client typed, which is what the admin
                  checks against the business GCash app. */}
              {selected.gcash_reference && (
                <div>
                  <p className="eyebrow mb-0.5">GCash Reference</p>
                  <p className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                    {selected.gcash_reference}
                  </p>
                </div>
              )}

              {/* GCash receipt thumbnail */}
              {selected.gcash_receipt && (
                <div>
                  <p className="eyebrow mb-1.5">GCash Receipt</p>
                  <img
                    src={receiptSrc(selected.gcash_receipt)}
                    alt="receipt"
                    className="rounded-xl max-h-48 object-contain cursor-pointer"
                    style={{ border: '1px solid var(--border)' }}
                    onClick={() => setImgModal(receiptSrc(selected.gcash_receipt))}
                  />
                </div>
              )}
            </div>

            {/* ── Reschedule form (toggle) ── */}
            {showReschedule && (
              <div className="px-5 pb-4 pt-2 space-y-3"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Reschedule Booking</p>
                <div>
                  <label className="label">New Date</label>
                  <RescheduleCalendar
                    selectedDate={newDate}
                    onSelect={setNewDate}
                    blockedDates={blockedDates}
                    dayCounts={dayCounts}
                  />
                </div>
                <div>
                  <label className="label">New Time</label>
                  <select className="input text-sm" value={newTime} onChange={e => setNewTime(e.target.value)}>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {/* Tell the admin why a date is unusable before she submits —
                    the server rejects it regardless, but failing here is
                    faster and explains itself. */}
                {rescheduleIssue(newDate) && (
                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                    <span>{rescheduleIssue(newDate)}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowReschedule(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                  <button onClick={doReschedule} disabled={submitting || !!rescheduleIssue(newDate)} className="btn-primary flex-1 text-sm">
                    {submitting ? 'Saving…' : 'Confirm Reschedule'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Record a payment ──
                Any amount, at any point: the ₱500 reservation arriving the day
                after a phone booking, a part payment, or the balance at the
                end. The box starts at what is still owed, so the common case
                is one tap, but it can be changed to the reservation alone. */}
            {showPayment && (
              <div className="px-5 pb-4 pt-2 space-y-3"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Record a Payment
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Total ₱{selTotal.toLocaleString()} · Paid ₱{selPaid.toLocaleString()} ·
                  Balance ₱{selBalance.toLocaleString()}
                </p>
                {/* The amount is FIXED, not typed. Z's Cleaning takes the
                    ₱500 reservation to hold a booking and the exact balance on
                    the day of service — confirmed with the owner, there is no
                    part payment and nobody pays short. A free text box would
                    only be a way to enter a wrong figure, so this states what
                    is being recorded and the button confirms it. */}
                <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {payIsReservation ? 'RESERVATION' : 'REMAINING BALANCE'}
                  </p>
                  <p className="font-black text-2xl" style={{ color: 'var(--brand)' }}>
                    ₱{Number(payAmount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowPayment(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                  <button onClick={doRecordPayment} disabled={submitting || payAmount === ''}
                    className="btn-primary flex-1 text-sm">
                    {submitting ? 'Saving…' : 'Record Payment'}
                  </button>
                </div>
              </div>
            )}

            {/* ── House size after the ocular inspection ──
                The client declares a size when booking; this is where it is
                corrected once someone has actually seen the house. The area
                charge follows the size, and the total follows the charge. */}
            {showSizeEdit && (
              <div className="px-5 pb-4 pt-2 space-y-3"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  House Size After Inspection
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Client declared {String(selected.sqm_range || 'under_100').replace(/_/g, ' ')}.
                  Service is ₱{Number(selected.service_price || 0).toLocaleString()}.
                </p>

                <div className="space-y-2">
                  {[
                    { val: 'under_100', label: 'Under 100 sqm',  pct: 0 },
                    { val: '100_200',   label: '100–200 sqm',    pct: addPct100 },
                    { val: '200_plus',  label: 'Above 200 sqm',  pct: addPct200 },
                  ].map(({ val, label, pct }) => (
                    <label key={val} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all"
                      style={{ borderColor: sizeRange === val ? 'var(--brand)' : 'var(--border)',
                               background:  sizeRange === val ? 'var(--brand-pale)' : 'var(--surface)' }}>
                      <input type="radio" name="sqm_range" value={val} checked={sizeRange === val}
                        onChange={e => { setSizeRange(e.target.value); setSizeCharge(''); }} className="sr-only"/>
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {pct > 0
                            ? `+${pct}% → ₱${(Number(selected.service_price || 0) * pct / 100).toLocaleString()}`
                            : 'No area charge'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="label">Different amount (optional)</label>
                  <input type="number" min="0" className="input text-sm" value={sizeCharge}
                    onChange={e => setSizeCharge(e.target.value)}
                    placeholder="Leave blank to use the percentage above"/>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    For a house that doesn't fit the usual rule.
                  </p>
                </div>

                <div>
                  <label className="label">Reason (shown to the client)</label>
                  <input className="input text-sm" maxLength={255} value={priceNote}
                    onChange={e => setPriceNote(e.target.value)}
                    placeholder="e.g. measured 150 sqm, 3-storey"/>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowSizeEdit(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                  <button onClick={doSetHouseSize} disabled={submitting} className="btn-primary flex-1 text-sm">
                    {submitting ? 'Saving…' : 'Save & Recalculate'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Rejecting a receipt ──────────────────────────────────────
                The admin checks the reference number and amount against the
                business GCash app. If it does not match, this is the way to say
                so — the reason is required, because it is sent to the client. */}
            {showReject && (
              <div className="px-5 pb-4 pt-2 space-y-3"
                style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Reject this GCash receipt
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  The booking stays pending and the slot is not held. The client is
                  notified with your reason and can upload a new receipt.
                </p>

                <div>
                  <label className="label">Reason (sent to the client)</label>
                  <input className="input text-sm" maxLength={255} value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. reference number not found in our GCash record"/>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['Reference number not found in our GCash record',
                    'Amount received is less than the reservation fee',
                    'Receipt is unreadable',
                    'Receipt is for a different account'].map(r => (
                    <button key={r} type="button" onClick={() => setRejectReason(r)}
                      className="text-[11px] px-2 py-1 rounded-lg border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      {r}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => { setShowReject(false); setRejectReason(''); }}
                    className="btn-secondary flex-1 text-sm">Cancel</button>
                  <button onClick={doRejectGcash} disabled={submitting || !rejectReason.trim()}
                    className="btn-primary flex-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                    {submitting ? 'Rejecting…' : 'Reject Receipt'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Action Buttons — one primary action per screen principle ──
                Secondary actions (Reschedule, Verify GCash) sit above in a smaller row.
                The single dominant action for this booking's status is full-width below. */}
            {!showReschedule && !showSizeEdit && !showPayment && !showReject && (
              <div className="px-5 pb-5 space-y-2"
                style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>

                {/* Secondary actions row — smaller, less prominent */}
                {selected.status !== 'cancelled' && selected.status !== 'completed' && (
                  <div className="flex gap-2">
                    {/* Reschedule — secondary action */}
                    {(selected.status === 'pending' || selected.status === 'confirmed') && (
                      <button disabled={submitting} onClick={() => setShowReschedule(true)}
                        className="btn-secondary text-xs flex items-center gap-1.5 flex-1">
                        <RefreshCw size={13} /> Reschedule
                      </button>
                    )}
                    {/* The size is corrected after the ocular inspection, which
                        happens once the booking is confirmed — so it is disabled
                        while still pending. It stays changeable after that, on
                        purpose: a mistyped size would otherwise be permanent and
                        leave the customer with a wrong price. It locks only once
                        the booking is fully paid, when the figures are history. */}
                    {(selected.status === 'pending' || selected.status === 'confirmed' || selected.status === 'done') && (
                      <button disabled={submitting || selected.status === 'pending' || fullyPaid}
                        onClick={() => {
                          setSizeRange(selected.sqm_range || 'under_100');
                          setSizeCharge('');
                          setPriceNote(selected.price_note || '');
                          setShowSizeEdit(true);
                        }}
                        className="btn-secondary text-xs flex items-center gap-1.5 flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
                        <ClipboardList size={13} /> {selected.priced_at ? 'Change Size' : 'Set House Size'}
                      </button>
                    )}
                    {/* Verifying a receipt is now the PRIMARY action above, so
                        the duplicate button that used to sit here is gone. */}
                  </div>
                )}
                {selected.status === 'pending' && (
                  <Why>The house size can be set once the booking is confirmed.</Why>
                )}
                {fullyPaid && selected.priced_at && (
                  <Why>This booking is fully paid, so the price is settled and the size is locked.</Why>
                )}

                {/* ── PRIMARY ACTION — one per screen, following the real
                    order of work:
                      receipt waiting → verify it
                      pending         → confirm (only once verified)
                      confirmed       → mark done (only on or after the day)
                      done            → record the balance
                    'completed' is never clicked: the server derives it from the
                    payments recorded. */}

                {/* A receipt waiting to be checked comes first. Confirming a
                    booking before checking it would promise a slot for money
                    nobody has looked at. */}
                {receiptWaiting && selected.status !== 'cancelled' && (
                  <>
                    <button disabled={submitting} onClick={() => verifyGcash(selected.id)}
                      className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2">
                      <CheckCircle size={15} /> Verify GCash Receipt
                    </button>
                    {/* Checking a receipt has two possible answers. Without
                        this, a receipt that did not check out left the admin
                        with nothing to click. */}
                    <button disabled={submitting} onClick={() => setShowReject(true)}
                      className="btn-secondary w-full !py-2.5 text-sm flex items-center justify-center gap-2"
                      style={{ color: '#dc2626', borderColor: '#fecaca' }}>
                      <XCircle size={15} /> Reject Receipt
                    </button>
                    {selected.status === 'pending' && (
                      <Why>The booking can be confirmed once the receipt is verified.</Why>
                    )}
                  </>
                )}

                {selected.status === 'pending' && !receiptWaiting && (
                  <button disabled={submitting} onClick={() => updateStatus(selected.id, 'confirmed')}
                    className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2">
                    <CheckCircle size={15} /> Confirm Booking
                  </button>
                )}

                {/* Service performed. Disabled before the booking date: a job
                    cannot be done before the day it happens. If the total is
                    already paid the server settles it to 'completed' in the
                    same step. */}
                {selected.status === 'confirmed' && (
                  <>
                    <button disabled={submitting || !serviceDayUp}
                      onClick={() => updateStatus(selected.id, 'done')}
                      className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      <CheckCircle size={15} /> Mark Service as Done
                    </button>
                    {!serviceDayUp && (
                      <Why>Available on {fmt(selected.date)}, the day of the service.</Why>
                    )}
                  </>
                )}

                {/* Performed but not settled — recording what is owed is the
                    remaining step. The panel opens with the balance filled in,
                    and the amount can be changed for a part payment. */}
                {payIsPrimary && (
                  <button disabled={submitting} onClick={() => openPaymentPanel()}
                    className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2">
                    <DollarSign size={15} /> Record ₱{selBalance.toLocaleString()} Payment → Complete
                  </button>
                )}

                {/* Only for a reservation that has NOT been received yet —
                    in practice a phone booking whose caller still owes the ₱500.
                    Once it is in, the only money left is the balance, and that
                    is collected on the day of service, so it belongs to the
                    'done' stage above rather than sitting here on a confirmed
                    booking with nothing to record. Hidden while a receipt is
                    waiting, since verifying it records the same ₱500. */}
                {payIsReservation && !receiptWaiting && selected.status !== 'cancelled' && (
                  <button disabled={submitting} onClick={() => openPaymentPanel()}
                    className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
                    <DollarSign size={15} /> Record ₱{reservationFee.toLocaleString()} Reservation
                  </button>
                )}

                {selected.status === 'completed' && (
                  <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    This booking is settled — service performed and payment received.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {imgModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 modal-overlay-in"
          onClick={() => setImgModal(null)}>
          <img src={imgModal} alt="receipt" className="max-w-full max-h-full rounded-xl modal-card-in" />
        </div>
      )}

      {/* ── Walk-in / phone booking ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAdd(false)}>
          <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto modal-card-in"
            style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>New Booking</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>For bookings made by phone or in person</p>
              </div>
              <button onClick={() => setShowAdd(false)} style={{ color: 'var(--text-muted)' }}><XCircle size={20}/></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Client */}
              <div>
                <label className="label">Client</label>
                <div className="flex gap-2 mb-2">
                  {['existing','new'].map(m => (
                    <button key={m} type="button" onClick={() => setAddForm(f => ({...f, mode: m}))}
                      className="flex-1 text-xs font-semibold py-2 rounded-lg border transition-all"
                      style={{
                        background:  addForm.mode === m ? 'var(--brand)' : 'transparent',
                        color:       addForm.mode === m ? 'white' : 'var(--text-muted)',
                        borderColor: addForm.mode === m ? 'var(--brand)' : 'var(--border)',
                      }}>
                      {m === 'existing' ? 'Existing client' : 'New caller'}
                    </button>
                  ))}
                </div>

                {addForm.mode === 'existing' ? (
                  <select className="input text-sm" value={addForm.client_id}
                    onChange={e => setAddForm(f => ({...f, client_id: e.target.value}))}>
                    <option value="">Select a client…</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {c.phone || (String(c.email).endsWith('@zclean.invalid') ? 'no email' : c.email)}</option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input className="input text-sm" placeholder="Full name *" value={addForm.new_name}
                      onChange={e => setAddForm(f => ({...f, new_name: e.target.value}))}/>
                    <input className="input text-sm" placeholder="Phone number" value={addForm.new_phone}
                      onChange={e => setAddForm(f => ({...f, new_phone: e.target.value}))}/>
                    <input className="input text-sm" type="email" placeholder="Email (optional)" value={addForm.new_email}
                      onChange={e => setAddForm(f => ({...f, new_email: e.target.value}))}/>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Without an email the booking is still recorded, but no confirmation or reminders can be sent.
                    </p>
                  </div>
                )}
              </div>

              {/* Service */}
              <div>
                <label className="label">Service</label>
                <select className="input text-sm" value={addForm.service_id}
                  onChange={e => setAddForm(f => ({...f, service_id: e.target.value}))}>
                  <option value="">Select a service…</option>
                  {services.map(sv => (
                    <option key={sv.id} value={sv.id}>{sv.name} — ₱{Number(sv.price).toLocaleString()}</option>
                  ))}
                </select>
              </div>

              {/* Add-ons */}
              {addons.length > 0 && (
                <div>
                  <label className="label">Add-ons</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {addons.map(a => (
                      <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={addForm.addon_ids.includes(a.id)}
                          onChange={e => setAddForm(f => ({
                            ...f,
                            addon_ids: e.target.checked
                              ? [...f.addon_ids, a.id]
                              : f.addon_ids.filter(x => x !== a.id),
                          }))}/>
                        <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                          +₱{Number(a.price).toLocaleString()}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Date — same availability calendar as reschedule */}
              <div>
                <label className="label">Date</label>
                <RescheduleCalendar
                  selectedDate={addForm.date}
                  onSelect={d => setAddForm(f => ({...f, date: d}))}
                  blockedDates={blockedDates}
                  dayCounts={dayCounts}
                />
              </div>

              {/* Location + size */}
              <div>
                <label className="label">Service Address</label>
                {/* Same selector the client booking page uses, so a phone
                    booking is recorded in the same format and the transport
                    fee is detected from the barangay automatically. */}
                <AddressSelector
                  value={addForm.location}
                  onChange={v => setAddForm(f => ({...f, location: v}))}
                />
                {addOutside && (
                  <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--brand)' }}>
                    <AlertTriangle size={11}/> ₱{addTransport.toLocaleString()} transport fee applied automatically for this barangay.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">House size</label>
                  <select className="input text-sm" value={addForm.sqm_range}
                    onChange={e => setAddForm(f => ({...f, sqm_range: e.target.value}))}>
                    <option value="under_100">Under 100 sqm</option>
                    <option value="100_200">100–200 sqm (+{addPct100}% of service)</option>
                    <option value="200_plus">Above 200 sqm (+{addPct200}% of service)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Payment</label>
                  <select className="input text-sm" value={addForm.payment_method}
                    onChange={e => setAddForm(f => ({...f, payment_method: e.target.value}))}>
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                  </select>
                </div>
              </div>

              {/* A phone booking is recorded before any money arrives, so the
                  reservation is not forced here the way it is for an online
                  booking. Ticking this records it as a real payment, so the
                  booking does not sit looking unpaid when it is not. */}
              <label className="flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                style={{ borderColor: addForm.reservation_paid ? 'var(--brand)' : 'var(--border)',
                         background:  addForm.reservation_paid ? 'var(--brand-pale)' : 'var(--surface)' }}>
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-700 shrink-0"
                  checked={addForm.reservation_paid}
                  onChange={e => setAddForm(f => ({ ...f, reservation_paid: e.target.checked }))}/>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    ₱{Number(settings.reservation_fee ?? 500).toLocaleString()} reservation already received
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Tick this only if the caller has already sent it. Leave it unticked and record the
                    payment later, once it arrives.
                  </p>
                </div>
              </label>

              <div>
                <label className="label">Notes</label>
                <textarea className="input text-sm resize-none" rows={2} value={addForm.notes}
                  onChange={e => setAddForm(f => ({...f, notes: e.target.value}))}/>
              </div>

              {/* Running total, so the admin can quote the caller on the phone */}
              {addService && (
                <div className="rounded-xl p-3 space-y-1" style={{ background: 'var(--surface2)' }}>
                  <div className="flex justify-between text-xs"><span style={{color:'var(--text-secondary)'}}>{addService.name}</span><span>₱{Number(addService.price).toLocaleString()}</span></div>
                  {addAddonTotal > 0 && <div className="flex justify-between text-xs"><span style={{color:'var(--text-secondary)'}}>Add-ons</span><span>₱{addAddonTotal.toLocaleString()}</span></div>}
                  {addSurcharge > 0 && <div className="flex justify-between text-xs"><span style={{color:'var(--text-secondary)'}}>Area surcharge</span><span>₱{addSurcharge.toLocaleString()}</span></div>}
                  {addTransport > 0 && <div className="flex justify-between text-xs"><span style={{color:'var(--text-secondary)'}}>Transport fee</span><span>₱{addTransport.toLocaleString()}</span></div>}
                  <div className="flex justify-between pt-1.5 font-bold text-sm" style={{ borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-primary)' }}>Total</span>
                    <span style={{ color: 'var(--brand)' }}>₱{addTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {addErr && (
                <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                  <AlertTriangle size={13} className="shrink-0 mt-0.5"/><span>{addErr}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                <button onClick={submitAdminBooking} disabled={submitting} className="btn-primary flex-1 text-sm">
                  {submitting ? 'Creating…' : 'Create Booking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="shrink-0 font-semibold w-24" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
