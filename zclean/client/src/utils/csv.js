// ── CSV export ───────────────────────────────────────────────────────────────
// Extracted from AdminReports so the Clients page can export without a second
// copy of the same logic. Escaping matters here: a client address like
// "Purok 2, Oquendo" contains a comma, and an unescaped comma silently shifts
// every following column into the wrong field.
//
// Rules applied (RFC 4180): wrap a value in quotes when it contains a comma,
// a quote, or a newline; double any quote inside it.
export const downloadCSV = (rows, filename) => {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const csv  = [keys.join(','), ...rows.map(r =>
    keys.map(k => {
      const v = r[k] === null || r[k] === undefined ? '' : String(r[k]);
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  )].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
