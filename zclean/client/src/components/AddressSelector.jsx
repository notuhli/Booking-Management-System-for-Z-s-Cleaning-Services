import { useState, useEffect } from 'react';
import { MUNICIPALITIES, getBarangays } from '../utils/addressData.js';

export default function AddressSelector({ value, onChange, required }) {
  // Parse the incoming value to seed internal dropdown state
  const parseAddress = (addr) => {
    if (!addr || !addr.trim()) return { muni: '', barangay: '', purok: '' };
    const parts = addr.split(',').map(p => p.trim());
    const muni     = MUNICIPALITIES.includes(parts[0]) ? parts[0] : '';
    const barangays = getBarangays(muni);
    const barangay = muni && barangays.includes(parts[1]) ? parts[1] : '';
    const purok    = parts[2] || '';
    return { muni, barangay, purok };
  };

  const initial = parseAddress(value);
  const [muni,     setMuni]     = useState(initial.muni);
  const [barangay, setBarangay] = useState(initial.barangay);
  const [purok,    setPurok]    = useState(initial.purok);
  const [manual,   setManual]   = useState(false);
  const [manualVal,setManualVal]= useState('');

  // Re-seed dropdowns when value prop changes (e.g. user loads asynchronously)
  useEffect(() => {
    if (!value || !value.trim()) return;
    const parsed = parseAddress(value);
    // Only update if dropdowns are still blank (don't override user's own selections)
    if (!muni && parsed.muni) {
      setMuni(parsed.muni);
      setBarangay(parsed.barangay);
      setPurok(parsed.purok);
    }
  }, [value]);

  const barangays = getBarangays(muni);

  useEffect(() => {
    if (!manual) {
      const parts = [muni, barangay, purok].filter(Boolean);
      onChange(parts.join(', '));
    }
  }, [muni, barangay, purok, manual]);

  if (manual) {
    return (
      <div>
        <textarea
          rows={2} className="input resize-none" required={required}
          placeholder="Type your full address..."
          value={manualVal}
          onChange={e => { setManualVal(e.target.value); onChange(e.target.value); }}
        />
        <button type="button" className="text-xs mt-1 font-semibold hover:underline" style={{ color: 'var(--brand)' }}
          onClick={() => setManual(false)}>Use dropdown instead</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className="input" value={muni} onChange={e => { setMuni(e.target.value); setBarangay(''); }}>
          <option value="">-- Municipality --</option>
          {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="input" value={barangay} onChange={e => setBarangay(e.target.value)} disabled={!muni}>
          <option value="">-- Barangay --</option>
          {barangays.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <input className="input" placeholder="Purok / Street (optional)"
          value={purok} onChange={e => setPurok(e.target.value)} />
      </div>
      <button type="button" className="text-xs font-semibold hover:underline" style={{ color: 'var(--brand)' }}
        onClick={() => setManual(true)}>Type address manually instead</button>
    </div>
  );
}
