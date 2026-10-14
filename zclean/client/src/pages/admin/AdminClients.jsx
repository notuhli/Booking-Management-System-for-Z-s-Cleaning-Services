import { useEffect, useState } from 'react';
import { Search, User, Users, Mail, Phone, CalendarCheck, AlertTriangle, Ban, CheckCircle, Trash2, Eye, Download } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { clientsAPI } from '../../services/api.js';
import { downloadCSV } from '../../utils/csv.js';
import { localDate } from '../../utils/localDate.js';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import { useToast } from '../../hooks/useToast.jsx';

export default function AdminClients() {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  // A selected client's booking history — previously the panel showed only a
  // count, which told the admin nothing when a client called to ask about a
  // past job.
  const [cBookings, setCBookings] = useState([]);
  const [cLoading,  setCLoading]  = useState(false);
  useEffect(() => {
    if (!selected) { setCBookings([]); return; }
    setCLoading(true);
    clientsAPI.bookings(selected.id)
      .then(r => setCBookings(r.data || []))
      .catch(() => setCBookings([]))
      .finally(() => setCLoading(false));
  }, [selected]);

  const toggleStatus = (c) => {
    const deactivating = c.is_active !== false;
    setConfirmState({
      message: deactivating
        ? `Deactivate ${c.name}'s account? They will no longer be able to sign in, but all their bookings and payments are kept.`
        : `Reactivate ${c.name}'s account? They will be able to sign in again.`,
      confirmLabel: deactivating ? 'Deactivate' : 'Reactivate',
      danger: deactivating,
      onConfirm: async () => {
        try {
          setBusy(true);
          const { data } = await clientsAPI.setStatus(c.id, !deactivating);
          showToast(data.message, 'success');
          setSelected(null);
          load();
        } catch (e) {
          showToast(e.response?.data?.message || "Couldn't update the account — try again.", 'error');
        } finally { setBusy(false); }
      },
    });
  };

  // Client list export. Uses the FILTERED list so a search narrows the export;
  // status is spelled out rather than exported as a raw boolean.
  const exportClients = () => {
    const rows = filtered.map(c => ({
      Name:            c.name,
      Email:           String(c.email).endsWith('@zclean.invalid') ? '' : c.email,
      Phone:           c.phone || '',
      Address:         c.address || '',
      'Total Bookings': c.total_bookings ?? 0,
      // Full history summary, then what they had done most recently
      'Services Booked': c.services_booked || '',
      'Latest Service':  c.latest_service || '',
      'Last Booking':    c.last_booking || '',
      Status:          c.is_active === false ? 'Deactivated' : 'Active',
      Joined:          fmt(c.created_at),
    }));
    downloadCSV(rows, `ZClean_Clients_${localDate()}.csv`);
  };

  const removeClient = (c) => {
    setConfirmState({
    message: `Permanently delete ${c.name}'s record? This cannot be undone.`,
    confirmLabel: 'Delete Permanently',
    danger: true,
    onConfirm: async () => {
      try {
        setBusy(true);
        const { data } = await clientsAPI.remove(c.id);
        showToast(data.message, 'success');
        setSelected(null);
        load();
      } catch (e) {
        showToast(e.response?.data?.message || "Couldn't delete the record — try again.", 'error');
      } finally { setBusy(false); }
    },
    });
  };

  // Hoisted out of useEffect so the error panel's Retry button can call it —
  // body is otherwise identical to the original.
  const load = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await clientsAPI.list();
      setClients(res.data || []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  // Placeholder emails for phone-booked clients are internal plumbing; show the
  // phone instead, or say plainly there is none. Same rule as the CSV export.
  const emailOf = (c) => {
    const e = String(c?.email || '');
    if (e && !e.endsWith('@zclean.invalid')) return e;
    return c?.phone || 'No email on file';
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '—';

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-[var(--fg)] mb-6">Clients</h1>

        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input pl-9 text-sm" placeholder="Search by name, email, or phone..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Exports whatever is currently listed, so a search or filter
              narrows the export too — otherwise the button would quietly
              ignore what the admin is looking at. */}
          <button onClick={exportClients} disabled={filtered.length === 0}
            className="btn-secondary text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-40">
            <Download size={14}/> Export CSV
          </button>
        </div>

        {loading ? (
          <div className="card overflow-hidden">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-full animate-pulse" style={{ background: 'var(--surface2)' }}/>
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  <div className="h-3 w-44 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            {loadError ? (
              <div className="text-center py-16">
                <AlertTriangle size={36} className="mx-auto mb-2" style={{ color: '#dc2626' }}/>
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn't load clients</p>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Check that the server is running, then try again.</p>
                <button onClick={load} className="btn-primary">Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Users size={36} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }}/>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No clients found.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filtered.map(c => (
                  /* Row is a div, not a button: action buttons live inside it,
                     and nesting a <button> in a <button> is invalid HTML and
                     breaks keyboard navigation. The details region keeps its
                     own button so the row is still fully keyboard-reachable. */
                  <div key={c.id} className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--surface)] transition">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[var(--brand)] text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {(c.name || 'U')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--fg)] flex items-center gap-2">
                          {c.name}
                          {c.is_active === false && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                              DEACTIVATED
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--muted)] truncate">{emailOf(c)}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 hidden md:block">
                      <p className="text-sm font-semibold text-[var(--brand)]">{c.total_bookings ?? 0}</p>
                      <p className="text-xs text-[var(--muted)]">bookings</p>
                    </div>

                    {/* Inline actions — same soft-pill treatment as the View
                        button on the Bookings page, so both admin tables share
                        one action style. Colour carries the intent: brand for
                        neutral, amber for deactivate, red for delete. */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <button onClick={() => setSelected(c)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ color: 'var(--brand)', background: 'var(--brand-pale)' }}>
                        <Eye size={13} /> View
                      </button>

                      <button onClick={() => toggleStatus(c)} disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={c.is_active === false
                          ? { color: '#166534', background: '#dcfce7' }
                          : { color: '#b45309', background: '#fef3c7' }}>
                        {c.is_active === false
                          ? <><CheckCircle size={13}/> Reactivate</>
                          : <><Ban size={13}/> Deactivate</>}
                      </button>

                      {/* Shown only when there is no booking history: deleting a
                          client cascades to their payments and would change past
                          revenue reports. No greyed-out button — an action that
                          can never be used is just noise on most rows. */}
                      {(c.total_bookings ?? 0) === 0 && (
                        <button onClick={() => removeClient(c)} disabled={busy}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ color: '#b91c1c', background: '#fee2e2' }}>
                          <Trash2 size={13}/> Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--muted)] mt-3">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Client Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="card w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-full bg-[var(--brand)] text-white text-2xl font-bold flex items-center justify-center mx-auto mb-3">
                {(selected.name || 'U')[0].toUpperCase()}
              </div>
              <h2 className="font-bold text-[var(--fg)] text-lg">{selected.name}</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-[var(--muted)]">
                <Mail size={14} className="text-[var(--brand)]" />
                <span>{emailOf(selected)}</span>
              </div>
              {selected.phone && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <Phone size={14} className="text-[var(--brand)]" />
                  <span>{selected.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[var(--muted)]">
                <CalendarCheck size={14} className="text-[var(--brand)]" />
                <span>{selected.total_bookings ?? 0} total bookings</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--muted)]">
                <User size={14} className="text-[var(--brand)]" />
                <span>Joined {fmt(selected.created_at)}</span>
              </div>
            </div>

            {/* Booking history — what they actually booked, not just a count */}
            <div className="mt-5">
              <p className="eyebrow mb-2">Booked Services</p>
              {cLoading ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
              ) : cBookings.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No bookings yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {cBookings.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                      style={{ background: 'var(--surface2)' }}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {b.service_name}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {fmt(b.date)} · {b.status}
                        </p>
                      </div>
                      <span className="text-xs font-bold shrink-0" style={{ color: 'var(--brand)' }}>
                        ₱{Number(b.total_price || 0).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setSelected(null)} className="btn-secondary w-full mt-3 text-sm">Close</button>
          </div>
        </div>
      )}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AdminLayout>
  );
}
