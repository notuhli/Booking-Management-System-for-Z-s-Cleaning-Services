// ── Local calendar date helper ───────────────────────────────────────────────
// `new Date().toISOString().split('T')[0]` looks like a harmless way to get
// "today", but toISOString() converts to UTC first. In Philippine time (UTC+8)
// that means between midnight and 8 AM it returns YESTERDAY's date — so
// "today" comparisons, "is this upcoming?" filters and reminder countdowns are
// all wrong for eight hours of every day.
//
// This builds the date from local calendar parts instead, which is what every
// date comparison in the app actually wants.
//
//   localDate()                    → today,      e.g. '2026-07-28'
//   localDate(someDateObject)      → that date's local YYYY-MM-DD
//   localDate(new Date(2026, 6, 1))→ '2026-07-01'
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convenience: today's date shifted by N days (negative = past).
export function localDateOffset(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

// Format a 'HH:MM:SS' or 'HH:MM' time string as 12-hour with AM/PM.
// Times are stored 24-hour but every client-facing surface shows 12-hour,
// which is what people in PH read.
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return t;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? '00'} ${suffix}`;
}
