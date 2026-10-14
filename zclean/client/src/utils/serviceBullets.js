// A service's bullet list may open with a lead-in line such as
// "Includes everything in Standard, plus:" — that's prose introducing the
// list, not a checklist item, so it renders italic and without a checkmark.
//
// Detection is deliberately forgiving because an admin types these by hand:
// case-insensitive, whitespace-tolerant, and any line ending in ':' counts,
// so alternative phrasings ("Everything in Platinum, plus:") work too.
export function isLeadIn(line = '') {
  const t = String(line).trim();
  if (!t) return false;
  return t.endsWith(':') || /^includes\b/i.test(t);
}
