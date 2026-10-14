import { X, Printer } from 'lucide-react';
import { receiptSrc } from '../services/api.js';

// ── Printable booking receipt ────────────────────────────────────────────────
// The itemised total previously lived only in the admin's view and the
// confirmation email, so a client had to dig through their inbox to check what
// they were charged. This is their copy: a real receipt they can read, print,
// or save as PDF (the browser's print dialog offers "Save as PDF" on every
// desktop platform — no PDF library needed).
//
// Printing is handled by the `print-receipt` rules in index.css: everything
// except this panel is hidden, so the output is the receipt alone.
export default function ReceiptModal({ booking, onClose, fmt }) {
  if (!booking) return null;

  const b       = booking;
  const addons  = b.addons || [];
  const surch   = Number(b.area_surcharge || 0);
  const transp  = Number(b.transport_fee  || 0);
  const total   = Number(b.total_price ?? b.service_price ?? 0);

  // Money already received (reservation, advance payment, part payment) and
  // what is still owed. A ₱500 reservation no longer reads as "PAID".
  const paidAmt = Number(b.amount_paid || 0);
  const balance = Math.max(0, total - paidAmt);

  const payLabel = b.payment_status === 'paid'
    ? 'PAID'
    : b.payment_status === 'partial'
      ? 'PARTIALLY PAID'
      : b.payment_status === 'pending_verification'
        ? 'RECEIPT UNDER REVIEW'
        : 'UNPAID';

  const Line = ({ label, value, muted }) => (
    <div className="flex justify-between gap-4 text-sm py-1">
      <span style={{ color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{label}</span>
      <span className="shrink-0" style={{ color: 'var(--text-primary)' }}>₱{Number(value).toLocaleString()}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print-overlay"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="card w-full max-w-sm max-h-[90vh] overflow-y-auto print-receipt"
        style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>

        {/* Header — business identity, so a printed copy stands alone */}
        <div className="px-5 py-4 text-center" style={{ borderBottom: '1px dashed var(--border)' }}>
          <button onClick={onClose} aria-label="Close"
            className="float-right no-print" style={{ color: 'var(--text-muted)' }}>
            <X size={18}/>
          </button>
          <p className="font-serif font-bold text-base" style={{ color: 'var(--text-primary)' }}>Z's Cleaning Services</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Calbayog City, Samar · 0916-213-3460</p>
          <p className="text-[11px] mt-2 font-semibold tracking-widest" style={{ color: 'var(--brand)' }}>BOOKING RECEIPT</p>
        </div>

        {/* Reference details */}
        <div className="px-5 py-3 space-y-1 text-xs" style={{ borderBottom: '1px dashed var(--border)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Booking No.</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>#{b.id}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Service Date</span>
            <span style={{ color: 'var(--text-primary)' }}>{fmt ? fmt(b.date) : b.date}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Time</span>
            <span style={{ color: 'var(--text-primary)' }}>9:00 AM</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>Location</span>
            <span className="text-right" style={{ color: 'var(--text-primary)' }}>{b.location}</span>
          </div>
        </div>

        {/* Itemised charges */}
        <div className="px-5 py-3" style={{ borderBottom: '1px dashed var(--border)' }}>
          <Line label={b.service_name} value={b.service_price || 0} />
          {addons.map((a, i) => <Line key={i} label={a.name} value={a.price || 0} />)}
          {surch  > 0 && (
            <Line label={`Area surcharge${b.sqm_range ? ` (${String(b.sqm_range).replace(/_/g, ' ')})` : ''}`} value={surch} />
          )}
          {transp > 0 && <Line label="Transport fee" value={transp} />}
        </div>

        {/* Total + payment */}
        <div className="px-5 py-4">
          <div className="flex justify-between items-baseline">
            {/* Until the house has been inspected this is a quote, and the
                receipt says so rather than implying a settled figure. */}
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
              {b.priced_at ? 'TOTAL' : 'ESTIMATED TOTAL'}
            </span>
            <span className="font-black text-xl" style={{ color: 'var(--brand)' }}>₱{total.toLocaleString()}</span>
          </div>
          {b.priced_at && b.price_note && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Price confirmed after we checked the property — {b.price_note}
            </p>
          )}
          {!b.priced_at && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Final price is confirmed after we check the size of the property.
            </p>
          )}
          {/* Shown only when money has been received but the bill isn't settled,
              so a fully paid or wholly unpaid receipt looks exactly as before. */}
          {paidAmt > 0 && balance > 0 && (
            <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '1px dashed var(--border)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Amount paid</span>
                <span style={{ color: 'var(--text-primary)' }}>₱{paidAmt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span style={{ color: 'var(--text-primary)' }}>Balance due</span>
                <span style={{ color: 'var(--brand)' }}>₱{balance.toLocaleString()}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between mt-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>
              Payment method: {b.payment_method === 'gcash' ? 'GCash' : 'Cash'}
            </span>
            <span className="font-bold tracking-wide"
              style={{ color: b.payment_status === 'paid' ? 'var(--brand)' : 'var(--text-muted)' }}>
              {payLabel}
            </span>
          </div>

          {/* The client's own uploaded GCash proof, kept with the receipt */}
          {b.payment_method === 'gcash' && b.gcash_receipt && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                YOUR GCASH PROOF
              </p>
              <img src={receiptSrc(b.gcash_receipt)} alt="GCash payment proof"
                className="rounded-lg w-full max-h-52 object-contain"
                style={{ border: '1px solid var(--border)' }}/>
            </div>
          )}

          <p className="text-[10px] text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            Issued {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} ·
            Thank you for choosing Z's Cleaning Services
          </p>
        </div>

        {/* Actions — hidden when printing */}
        <div className="px-5 pb-5 flex gap-2 no-print">
          <button onClick={() => window.print()} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
            <Printer size={14}/> Print / Save as PDF
          </button>
          <button onClick={onClose} className="btn-secondary text-sm px-4">Close</button>
        </div>
      </div>
    </div>
  );
}
