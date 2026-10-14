import { useEffect, useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Save, Image as ImageIcon, Upload, CreditCard, RotateCcw, EyeOff, AlertTriangle, Banknote, Truck, Search } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import { servicesAPI, globalAddonsAPI, settingsAPI, transportFeesAPI } from '../../services/api.js';
import { MUNICIPALITIES, getBarangays } from '../../utils/addressData.js';
import { useToast } from '../../hooks/useToast.jsx';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api','') || 'http://localhost:5000';

const BLANK_SVC  = { name:'', description:'', details:'', price:'', duration_hrs:'3', image_url:'' };
const BLANK_ADDON = { name:'', price:'', is_active: true };

export default function AdminServices() {
  const { showToast } = useToast();
  const [confirmState, setConfirmState] = useState(null);
  const [services,  setServices]  = useState([]);
  const [addons,    setAddons]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab,       setTab]       = useState('services');
  const [svcModal,  setSvcModal]  = useState(null); // null | 'new' | service obj
  const [addonModal,setAddonModal]= useState(null);
  const [svcForm,   setSvcForm]   = useState(BLANK_SVC);
  const [addonForm, setAddonForm] = useState(BLANK_ADDON);
  const [imgFile,   setImgFile]   = useState(null);
  const [imgPreview,setImgPreview]= useState('');
  const [submitting,setSubmitting]= useState(false);
  const [settings,  setSettings]  = useState({ gcash_name:'', gcash_number:'', gcash_qr_url:'', transport_fee:'500', surcharge_pct_100_200:'100', surcharge_pct_200_plus:'150', reservation_fee:'500' });
  const [gcashFile, setGcashFile] = useState(null);
  const [gcashFileError, setGcashFileError] = useState('');
  const [gcashPreview, setGcashPreview] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [msg,       setMsg]       = useState('');
  const [err,       setErr]       = useState('');
  const fileRef = useRef();

  // ── Transportation fees ────────────────────────────────────────────────────
  // One municipality is edited at a time: its default fee, plus a box for any
  // barangay that should cost something different. A blank box means "follow
  // the default", so the admin only fills in the exceptions.
  const [feeMuni,     setFeeMuni]     = useState(MUNICIPALITIES[0] || '');
  const [feeDefault,  setFeeDefault]  = useState('0');
  const [feeOverrides,setFeeOverrides]= useState({});
  const [feeSearch,   setFeeSearch]   = useState('');
  const [feeSaving,   setFeeSaving]   = useState(false);
  const [feeSaved,    setFeeSaved]    = useState(false);
  const [feeTable,    setFeeTable]    = useState({ defaults: {}, overrides: {} });

  const loadFees = async () => {
    try {
      const { data } = await transportFeesAPI.get();
      setFeeTable(data || { defaults: {}, overrides: {} });
    } catch (e) { console.error('transport fees load error:', e.message); }
  };
  useEffect(() => { loadFees(); }, []);

  // Refill the boxes whenever the municipality (or the saved table) changes.
  useEffect(() => {
    if (!feeMuni) return;
    setFeeDefault(String(feeTable.defaults?.[feeMuni] ?? 0));
    const saved = feeTable.overrides?.[feeMuni] || {};
    setFeeOverrides(Object.fromEntries(Object.entries(saved).map(([b, v]) => [b, String(v)])));
    setFeeSearch('');
  }, [feeMuni, feeTable]);

  const saveFees = async () => {
    setFeeSaving(true);
    try {
      // Only boxes that were actually filled in are sent; the rest follow the
      // municipality default, and clearing a box removes its override.
      const overrides = {};
      Object.entries(feeOverrides).forEach(([b, v]) => {
        if (String(v).trim() !== '') overrides[b] = Number(v);
      });
      await transportFeesAPI.save(feeMuni, { default_fee: Number(feeDefault || 0), overrides });
      await loadFees();
      setFeeSaved(true); setTimeout(() => setFeeSaved(false), 3000);
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to save transportation fees.', 'error');
    } finally { setFeeSaving(false); }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      // Fetch services and addons separately from settings so one failure doesn't block the other
      const [sRes, aRes] = await Promise.all([servicesAPI.all(), globalAddonsAPI.all()]);
      setServices(sRes.data || []);
      setAddons(aRes.data || []);
    } catch (e) {
      console.error('loadAll error:', e.message);
      setLoadError(true);
    } finally { setLoading(false); }
    // Load settings independently
    try {
      const stRes = await settingsAPI.get();
      const st = stRes.data || {};
      setSettings({ gcash_name: st.gcash_name || '', gcash_number: st.gcash_number || '', gcash_qr_url: st.gcash_qr_url || '', transport_fee: st.transport_fee || '500', surcharge_pct_100_200: st.surcharge_pct_100_200 ?? '100', surcharge_pct_200_plus: st.surcharge_pct_200_plus ?? '150', reservation_fee: st.reservation_fee ?? '500' });
      if (st.gcash_qr_url && st.gcash_qr_url.trim()) setGcashPreview(st.gcash_qr_url);
    } catch (e) {
      console.error('settings load error:', e.message);
    }
  };

  useEffect(() => { loadAll(); }, []);

  /* ---- Services ---- */
  const openSvcModal = (svc) => {
    setSvcForm(svc ? { name: svc.name, description: svc.description||'', details: svc.details||'', price: svc.price, duration_hrs: svc.duration_hrs, image_url: svc.image_url||'' } : BLANK_SVC);
    setImgFile(null);
    setImgPreview(svc?.image_url ? svc.image_url : '');
    setErr('');
    setSvcModal(svc || 'new');
  };

  const saveSvc = async () => {
    if (!svcForm.name || !svcForm.price) return setErr('Name and price are required.');
    try {
      setSubmitting(true); setErr('');
      const fd = new FormData();
      fd.append('name',           svcForm.name);
      fd.append('description',    svcForm.description || '');
      fd.append('details',        svcForm.details || '');
      fd.append('price',         svcForm.price);
      fd.append('duration_hrs',  svcForm.duration_hrs || '3');
      if (imgFile) fd.append('image', imgFile);

      if (svcModal === 'new') {
        await servicesAPI.create(fd);
        showToast('Service created', 'success');
      } else {
        await servicesAPI.update(svcModal.id, fd);
        showToast('Service updated', 'success');
      }
      setSvcModal(null);
      loadAll();
    } catch (e) { setErr(e.response?.data?.message || "Couldn't save — try again."); }
    finally { setSubmitting(false); }
  };

  const deleteSvc = (id) => {
    setConfirmState({
      message: 'Deactivate this service? It will be hidden from clients but stays in your records — you can reactivate it anytime.',
      confirmLabel: 'Deactivate',
      danger: false,
      onConfirm: async () => {
        try { await servicesAPI.delete(id); showToast('Service deactivated', 'success'); loadAll(); }
        catch (e) { setMsg(e.response?.data?.message || 'Error.'); }
      },
    });
  };

  const reactivateSvc = async (id) => {
    try { await servicesAPI.reactivate(id); showToast('Service reactivated', 'success'); loadAll(); }
    catch (e) { setMsg(e.response?.data?.message || 'Error.'); }
  };

  const permanentDeleteSvc = (id) => {
    setConfirmState({
      message: 'Permanently delete this service? This cannot be undone.',
      confirmLabel: 'Delete Permanently',
      danger: true,
      onConfirm: async () => {
        try {
          await servicesAPI.permanentDelete(id);
          showToast('Service permanently deleted', 'success');
          loadAll();
        } catch (e) {
          // Backend blocks this if the service has existing bookings — show that reason clearly
          setMsg(e.response?.data?.message || "Couldn't delete the service — try again.");
        }
      },
    });
  };

  /* ---- Add-ons ---- */
  const openAddonModal = (a) => {
    setAddonForm(a ? { ...a } : BLANK_ADDON);
    setErr('');
    setAddonModal(a || 'new');
  };

  const saveAddon = async () => {
    if (!addonForm.name || !addonForm.price) return setErr('Name and price required.');
    try {
      setSubmitting(true); setErr('');
      if (addonModal === 'new') {
        await globalAddonsAPI.create(addonForm);
        showToast('Add-on created', 'success');
      } else {
        await globalAddonsAPI.update(addonModal.id, addonForm);
        showToast('Add-on updated', 'success');
      }
      setAddonModal(null);
      loadAll();
    } catch (e) { setErr(e.response?.data?.message || "Couldn't save — try again."); }
    finally { setSubmitting(false); }
  };

  // This button used to say "Delete" while the server only deactivated, so an
  // add-on could never actually be removed. Deactivate and permanent delete are
  // now separate, and each says what it really does — same as services.
  const deleteAddon = (id) => {
    setConfirmState({
      message: 'Deactivate this add-on? It will be hidden from clients but stays in your records — you can reactivate it anytime.',
      confirmLabel: 'Deactivate',
      danger: false,
      onConfirm: async () => {
        try { await globalAddonsAPI.delete(id); showToast('Add-on deactivated', 'success'); loadAll(); }
        catch (e) { setMsg(e.response?.data?.message || 'Error.'); }
      },
    });
  };

  const reactivateAddon = async (a) => {
    try {
      await globalAddonsAPI.update(a.id, { name: a.name, price: a.price, is_active: true });
      showToast('Add-on reactivated', 'success');
      loadAll();
    } catch (e) { setMsg(e.response?.data?.message || 'Error.'); }
  };

  const permanentDeleteAddon = (id) => {
    setConfirmState({
      message: 'Permanently delete this add-on? This cannot be undone.',
      confirmLabel: 'Delete Permanently',
      danger: true,
      onConfirm: async () => {
        try {
          await globalAddonsAPI.permanentDelete(id);
          showToast('Add-on permanently deleted', 'success');
          loadAll();
        } catch (e) {
          // The server blocks this when a booking uses the add-on — show why.
          setMsg(e.response?.data?.message || "Couldn't delete the add-on — try again.");
        }
      },
    });
  };

  const handleImgChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  return (
    <>
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-[var(--fg)] mb-6">Services & Add-ons</h1>

        {msg && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--brand-pale)] text-[var(--brand)] text-sm flex justify-between">
            {msg} <button onClick={() => setMsg('')}><X size={14}/></button>
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex border border-[var(--border)] rounded-xl overflow-hidden mb-6 w-fit">
          {[{key:'services',label:'Services'},{key:'addons',label:'Global Add-ons'},{key:'settings',label:'Payment Settings'}].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 text-sm font-medium transition
                ${tab===t.key ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--fg)]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Load failure banner — covers the services/add-ons data; GCash
            settings load independently by design and are unaffected */}
        {!loading && loadError && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3 mb-4"
            style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>
              <AlertTriangle size={16} className="inline mr-1.5 -mt-0.5"/>Couldn't load services and add-ons — the lists below may be incomplete.
            </p>
            <button onClick={loadAll} className="btn-primary" style={{ padding: '6px 16px' }}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="card overflow-hidden p-0">
                <div className="h-36 animate-pulse" style={{ background: 'var(--surface2)' }}/>
                <div className="p-4 space-y-2">
                  <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  <div className="h-3 w-full rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'settings' ? null : tab === 'services' ? (

          /* ---- Services Tab ---- */
          <>
            <div className="flex justify-end mb-3">
              <button onClick={() => openSvcModal(null)} className="btn-primary text-sm flex items-center gap-2">
                <Plus size={15}/> Add Service
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {services.map(s => (
                <div key={s.id} className="card overflow-hidden" style={{ opacity: s.is_active ? 1 : 0.65 }}>
                  {s.image_url && (
                    <img src={s.image_url} alt={s.name}
                      className="w-full h-36 object-cover" />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[var(--fg)]">{s.name}</p>
                          {/* Inactive badge — reuses the same badge pattern already used for add-ons */}
                          {!s.is_active && (
                            <span className="badge-error text-xs">Inactive</span>
                          )}
                        </div>
                        <p className="text-[var(--brand)] font-bold mt-1">₱{Number(s.price).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => openSvcModal(s)} className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)]" aria-label="Edit service"><Pencil size={15}/></button>
                        {s.is_active ? (
                          <button onClick={() => deleteSvc(s.id)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500" aria-label="Deactivate service" title="Deactivate — hides this service from clients but keeps it (and its booking history) intact"><EyeOff size={15}/></button>
                        ) : (
                          <>
                            <button onClick={() => reactivateSvc(s.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" aria-label="Reactivate service"><RotateCcw size={15}/></button>
                            <button onClick={() => permanentDeleteSvc(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" aria-label="Permanently delete service" title="Permanently delete (only possible if this service has no bookings)"><Trash2 size={15}/></button>
                          </>
                        )}
                      </div>
                    </div>
                    {s.description && <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2">{s.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>

        ) : tab === 'addons' ? (

          /* ---- Add-ons Tab ---- */
          <>
            <div className="flex justify-end mb-3">
              <button onClick={() => openAddonModal(null)} className="btn-primary text-sm flex items-center gap-2">
                <Plus size={15}/> Add Add-on
              </button>
            </div>
            <div className="card overflow-hidden">
              {addons.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">🧰</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No add-ons yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm min-w-[420px]">
                  <thead className="bg-[var(--surface)] border-b border-[var(--border)]">
                    <tr>
                      {['Name','Price','Status','Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {addons.map(a => (
                      <tr key={a.id} className="hover:bg-[var(--surface)] transition">
                        <td className="px-4 py-3 font-medium text-[var(--fg)]">{a.name}</td>
                        <td className="px-4 py-3 text-[var(--brand)] font-semibold">₱{Number(a.price).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={a.is_active ? 'badge-success text-xs' : 'badge-error text-xs'}>
                            {a.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button onClick={() => openAddonModal(a)} className="p-1 rounded hover:bg-[var(--surface)] text-[var(--muted)]" aria-label="Edit add-on"><Pencil size={15}/></button>
                          {a.is_active ? (
                            <button onClick={() => deleteAddon(a.id)} className="p-1 rounded hover:bg-amber-50 text-amber-500" aria-label="Deactivate add-on" title="Deactivate — hides this add-on from clients but keeps it (and its booking history) intact"><EyeOff size={15}/></button>
                          ) : (
                            <>
                              <button onClick={() => reactivateAddon(a)} className="p-1 rounded hover:bg-green-50 text-green-600" aria-label="Reactivate add-on"><RotateCcw size={15}/></button>
                              <button onClick={() => permanentDeleteAddon(a.id)} className="p-1 rounded hover:bg-red-50 text-red-600" aria-label="Permanently delete add-on" title="Permanently delete (only possible if no booking uses this add-on)"><Trash2 size={15}/></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

        {/* ---- Settings Tab ---- */}
        {tab === 'settings' && (
          /* Centred, fixed-width column: settings are a focused form, not a
             data table, so they read better in a narrow centred stack than
             stretched across the full page width. */
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-5">
              <h2 className="font-serif text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Payment Settings</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Where clients send GCash payments, and the extra fees applied at booking.
              </p>
            </div>

            {/* Two columns on desktop so the QR upload and the charge fields are
                both visible without scrolling; stacks on mobile. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

            {/* LEFT — GCash account details + QR */}
            <div className="space-y-5">
            <div className="card p-5">
              <p className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <CreditCard size={16} style={{ color: 'var(--brand)' }}/> GCash Account
              </p>
              {settingsSaved && <div className="mb-3 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>Settings saved!</div>}
              <div className="space-y-3">
                <div>
                  <label className="label">Account Name</label>
                  <input className="input" placeholder="e.g. Z's Cleaning Services"
                    value={settings.gcash_name || ''} onChange={e => setSettings(s => ({...s, gcash_name: e.target.value}))}/>
                </div>
                <div>
                  <label className="label">GCash Number</label>
                  <input className="input" placeholder="e.g. 0916-213-3460"
                    value={settings.gcash_number || ''} onChange={e => setSettings(s => ({...s, gcash_number: e.target.value}))}/>
                </div>
                <button onClick={async () => {
                  try {
                    await settingsAPI.update({ gcash_name: settings.gcash_name, gcash_number: settings.gcash_number, transport_fee: settings.transport_fee, surcharge_pct_100_200: settings.surcharge_pct_100_200, surcharge_pct_200_plus: settings.surcharge_pct_200_plus, reservation_fee: settings.reservation_fee });
                    setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000);
                  } catch {}
                }} className="btn-primary text-sm flex items-center gap-2 w-full justify-center">
                  <Save size={14}/> Save Settings
                </button>
              </div>
            </div>

            <div className="card p-5">
              <p className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Upload size={16} style={{ color: 'var(--brand)' }}/> GCash QR Code
              </p>
              {gcashPreview && (
                <img src={gcashPreview} alt="GCash QR" className="w-36 h-36 object-contain mx-auto mb-3 rounded-xl bg-white p-2"
                  style={{ border: '1px solid var(--border)' }}/>
              )}
              {gcashFileError && (
                <p className="text-xs mb-2 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                  {gcashFileError}
                </p>
              )}
              <input type="file" accept="image/*" onChange={e => {
                const f = e.target.files[0]; if (!f) return;
                setGcashFileError('');
                if (!f.type.startsWith('image/')) {
                  setGcashFileError('Please select an image file (JPG, PNG, etc.)');
                  e.target.value = '';
                  return;
                }
                if (f.size > 5 * 1024 * 1024) {
                  setGcashFileError(`File is too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Please choose an image under 5MB.`);
                  e.target.value = '';
                  return;
                }
                setGcashFile(f); setGcashPreview(URL.createObjectURL(f));
              }} className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 cursor-pointer mb-3"
                style={{ color: 'var(--text-muted)' }}/>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>JPG, PNG, or WEBP. Max 5MB.</p>
              {gcashFile && (
                <button onClick={async () => {
                  try {
                    const fd = new FormData(); fd.append('qr_image', gcashFile);
                    await settingsAPI.uploadQr(fd);
                    setSettingsSaved(true); setGcashFile(null); setTimeout(() => setSettingsSaved(false), 3000);
                  } catch {}
                }} className="btn-primary text-sm flex items-center gap-2 w-full justify-center">
                  <Upload size={14}/> Upload QR Code
                </button>
              )}
            </div>

            {/* RIGHT — pricing rules; charges applied to every booking, not
                GCash account details, so they get their own column. */}
            </div>
            <div className="space-y-5">
            <div className="card p-5">
              <p className="font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Banknote size={16} style={{ color: 'var(--brand)' }}/> Additional Charges
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Added automatically to a booking's total when it qualifies.
              </p>
              <div className="space-y-3">
                {/* The transportation fee moved to its own card below, where it
                    is set per barangay instead of one flat amount. */}
                <div>
                  <label className="label">GCash Reservation (₱)</label>
                  <input type="number" min="0" className="input" value={settings.reservation_fee}
                    onChange={e => setSettings(s => ({...s, reservation_fee: e.target.value}))}/>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    What a client sends by GCash to hold a booking. The rest is collected on the day.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Area: 100–200 sqm (%)</label>
                    <input type="number" min="0" className="input" value={settings.surcharge_pct_100_200}
                      onChange={e => setSettings(s => ({...s, surcharge_pct_100_200: e.target.value}))}/>
                  </div>
                  <div>
                    <label className="label">Area: Above 200 sqm (%)</label>
                    <input type="number" min="0" className="input" value={settings.surcharge_pct_200_plus}
                      onChange={e => setSettings(s => ({...s, surcharge_pct_200_plus: e.target.value}))}/>
                  </div>
                </div>
                {/* Percent of the SERVICE price, so the charge scales with the
                    package instead of being the same peso amount for all. */}
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  A percentage of the service price only — add-ons and the transportation fee are not
                  included. 100% doubles the service price.
                </p>
                <button onClick={async () => {
                  try {
                    await settingsAPI.update({ gcash_name: settings.gcash_name, gcash_number: settings.gcash_number, transport_fee: settings.transport_fee, surcharge_pct_100_200: settings.surcharge_pct_100_200, surcharge_pct_200_plus: settings.surcharge_pct_200_plus, reservation_fee: settings.reservation_fee });
                    setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000);
                  } catch {}
                }} className="btn-primary text-sm flex items-center gap-2 w-full justify-center">
                  <Save size={14}/> Save Charges
                </button>
              </div>
            </div>

            {/* ── Transportation fees by barangay ──────────────────────────
                One default for the whole municipality, plus a box for any
                barangay that costs more or less. Blank = follow the default,
                and 0 is a real value, meaning "no transport fee here". */}
            <div className="card p-5">
              <p className="font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Truck size={16} style={{ color: 'var(--brand)' }}/> Transportation Fees
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Set the usual fee for a municipality, then change only the barangays that differ.
              </p>
              {feeSaved && (
                <div className="mb-3 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                  Transportation fees saved!
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label">Municipality</label>
                  <select className="input" value={feeMuni} onChange={e => setFeeMuni(e.target.value)}>
                    {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Default fee (₱)</label>
                  <input type="number" min="0" className="input" value={feeDefault}
                    onChange={e => setFeeDefault(e.target.value)}/>
                </div>
              </div>

              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}/>
                <input className="input !pl-9 text-sm" placeholder="Search barangay..."
                  value={feeSearch} onChange={e => setFeeSearch(e.target.value)}/>
              </div>

              <div className="rounded-xl border max-h-72 overflow-y-auto divide-y"
                style={{ borderColor: 'var(--border)' }}>
                {getBarangays(feeMuni)
                  .filter(b => b.toLowerCase().includes(feeSearch.trim().toLowerCase()))
                  .map(b => (
                    <div key={b} className="flex items-center gap-3 px-3 py-2"
                      style={{ borderColor: 'var(--border)' }}>
                      <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{b}</span>
                      <input type="number" min="0" className="input !py-1.5 text-sm" style={{ width: 110 }}
                        placeholder={`₱${Number(feeDefault || 0).toLocaleString()}`}
                        value={feeOverrides[b] ?? ''}
                        onChange={e => setFeeOverrides(o => ({ ...o, [b]: e.target.value }))}/>
                    </div>
                  ))}
                {getBarangays(feeMuni).filter(b => b.toLowerCase().includes(feeSearch.trim().toLowerCase())).length === 0 && (
                  <p className="text-xs px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    No barangay matches "{feeSearch}".
                  </p>
                )}
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Leave a box empty to use the default. Type 0 for a barangay with no transportation fee.
              </p>

              <button onClick={saveFees} disabled={feeSaving}
                className="btn-primary text-sm flex items-center gap-2 w-full justify-center mt-3">
                <Save size={14}/> {feeSaving ? 'Saving...' : `Save ${feeMuni} Fees`}
              </button>
            </div>
            </div>

            </div>
          </div>
        )}

      {/* Service Modal */}
      {svcModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 modal-overlay-in">
          <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto modal-card-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[var(--fg)]">{svcModal === 'new' ? 'Add Service' : 'Edit Service'}</h2>
              <button onClick={() => setSvcModal(null)} aria-label="Close"><X size={18} className="text-[var(--muted)]"/></button>
            </div>
            {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={svcForm.name} onChange={e => setSvcForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none" rows={2} value={svcForm.description} onChange={e => setSvcForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div>
                <label className="label">Bullet Points</label>
                <textarea className="input resize-none" rows={8}
                  placeholder={"One bullet per line, e.g.\nIncludes everything in Standard, plus:\nDeep scrub of all bathroom tiles\nWindow cleaning inside and out"}
                  value={svcForm.details} onChange={e => setSvcForm(f=>({...f,details:e.target.value}))} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Each line becomes a checkmarked bullet on the homepage and booking page.
                  To show a lead-in like <em>"Includes everything in Platinum, plus:"</em>, just make it the first line.
                </p>
              </div>
              <div>
                <label className="label">Price (₱)</label>
                <input type="number" className="input" placeholder="e.g. 1199" value={svcForm.price} onChange={e => setSvcForm(f=>({...f,price:e.target.value}))} />
              </div>
              <div>
                <label className="label">Service Image</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImgChange} />
                <div
                  onClick={() => fileRef.current.click()}
                  className="border-2 border-dashed border-[var(--border)] rounded-xl p-4 text-center cursor-pointer hover:border-[var(--brand)] transition"
                >
                  {imgPreview
                    ? <img src={imgPreview} alt="preview" className="h-28 mx-auto object-cover rounded-lg" />
                    : <><ImageIcon size={28} className="mx-auto text-[var(--muted)] mb-1"/><p className="text-xs text-[var(--muted)]">Click to upload</p></>
                  }
                </div>
              </div>
              <button onClick={saveSvc} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
                {submitting ? 'Saving...' : <><Save size={15}/> Save Service</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-on Modal */}
      {addonModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 modal-overlay-in">
          <div className="card w-full max-w-sm p-6 modal-card-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[var(--fg)]">{addonModal === 'new' ? 'Add Add-on' : 'Edit Add-on'}</h2>
              <button onClick={() => setAddonModal(null)} aria-label="Close"><X size={18} className="text-[var(--muted)]"/></button>
            </div>
            {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={addonForm.name} onChange={e => setAddonForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div>
                <label className="label">Price (₱)</label>
                <input type="number" className="input" value={addonForm.price} onChange={e => setAddonForm(f=>({...f,price:e.target.value}))} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={addonForm.is_active ? '1' : '0'} onChange={e => setAddonForm(f=>({...f,is_active:e.target.value==='1'}))}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>
              <button onClick={saveAddon} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
                {submitting ? 'Saving...' : <><Save size={15}/> Save Add-on</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
    <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
