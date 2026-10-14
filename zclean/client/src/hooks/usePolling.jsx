import { useEffect, useRef } from 'react';

// ── usePolling ───────────────────────────────────────────────────────────────
// Keeps a screen current without the person pressing anything.
//
// The admin can have Bookings open all afternoon; until now a booking made in
// that time did not appear until she reloaded the page. Same for a client
// watching for their booking to be confirmed.
//
// Three details that matter more than the timer itself:
//
//  1. It STOPS while the tab is hidden. A page left open in a background tab
//     overnight would otherwise fire thousands of requests at a free-tier
//     database for nobody's benefit — and would eat into the rate limit added
//     in Phase 5.
//
//  2. It refreshes IMMEDIATELY when the person comes back to the tab, so what
//     they see is current the moment they look at it, not up to a minute stale.
//
//  3. The callback is held in a ref, so the interval is set up once and always
//     calls the latest version. Passing the function straight to useEffect
//     would restart the timer on every render and could fire constantly.
//
// Usage:  usePolling(load, 20000);
export function usePolling(callback, intervalMs = 20000, enabled = true) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let timer = null;

    const run = () => { if (!document.hidden) saved.current?.(); };

    const start = () => {
      if (timer) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        saved.current?.();   // catch up right away
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [intervalMs, enabled]);
}

export default usePolling;
