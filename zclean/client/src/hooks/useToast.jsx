import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast stack — fixed top-right, does not affect page layout */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 360 }}>
        {toasts.map(t => (
          <div key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium"
            style={{
              background: t.type === 'error' ? '#fef2f2' : t.type === 'success' ? 'var(--brand-pale)' : 'var(--surface)',
              border: `1px solid ${t.type === 'error' ? '#fecaca' : t.type === 'success' ? 'var(--brand)' : 'var(--border)'}`,
              color: t.type === 'error' ? '#b91c1c' : t.type === 'success' ? 'var(--brand)' : 'var(--text-primary)',
              animation: 'toastIn 0.25s ease-out',
            }}>
            <span className="shrink-0 mt-0.5">
              {t.type === 'error' ? '✕' : t.type === 'success' ? '✓' : 'ℹ'}
            </span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-50 hover:opacity-100" aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
