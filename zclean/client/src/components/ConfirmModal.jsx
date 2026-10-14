import { AlertTriangle } from 'lucide-react';

// Reusable confirmation dialog — replaces the native browser confirm() popup
// ("localhost says...") with a modal styled to match the rest of the app.
//
// Usage: render <ConfirmModal /> once per page, pass it a `state` object of
// shape { message, onConfirm } (or null when no confirmation is pending),
// and a `setState(null)` style close handler.
//
// ALERT MODE: omit `onConfirm` and the dialog becomes a single-button notice
// ({ message, alert: true }). Used for blocking errors that must not be
// missed — an inline banner at the top of a long form is invisible to someone
// submitting from the bottom.
export default function ConfirmModal({ state, onClose }) {
  if (!state) return null;
  const { message, onConfirm, confirmLabel = 'Confirm', danger = true, alert = false } = state;
  const isAlert = alert || typeof onConfirm !== 'function';

  const handleConfirm = async () => {
    onClose();          // close immediately so the dialog never blocks the async action
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 modal-overlay-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}>
      <div className="card w-full max-w-sm p-6 modal-card-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: danger ? '#fef2f2' : 'var(--brand-pale)', color: danger ? '#dc2626' : 'var(--brand)' }}>
            <AlertTriangle size={18}/>
          </div>
          <p className="text-sm pt-1.5" style={{ color: 'var(--text-primary)' }}>{message}</p>
        </div>
        <div className="flex gap-2.5">
          {isAlert ? (
            <button onClick={onClose}
              className="flex-1 !py-2 !text-sm rounded-xl font-semibold text-white transition-colors"
              style={{ background: 'var(--brand)' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              Got it
            </button>
          ) : (<>
          <button onClick={onClose} className="btn-secondary flex-1 !py-2 !text-sm">Cancel</button>
          <button onClick={handleConfirm}
            className="flex-1 !py-2 !text-sm rounded-xl font-semibold text-white transition-colors"
            style={{ background: danger ? '#dc2626' : 'var(--brand)' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            {confirmLabel}
          </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
