// ── Input validation ─────────────────────────────────────────────────────────
// Small, shared checks for the data that write endpoints accept.
//
// Why it exists: the forms in the React app already limit what a person can
// type, but the browser is not a security boundary. Anything that reaches the
// API can be sent directly — with a 50,000-character name, a negative price, or
// a status that is not one of the allowed words — and until now most endpoints
// passed such values straight into a query. The database's own CHECK
// constraints caught some of it, but as a 500 error the client could not act on.
//
// Each helper returns an error MESSAGE (a string) when the value is wrong, or
// null when it is fine, so a controller reads as one line per field:
//
//   const bad = firstError([
//     str(name, 'Name', { required: true, max: 100 }),
//     money(price, 'Price', { required: true }),
//   ]);
//   if (bad) return res.status(400).json({ message: bad });

// A required text field, with a maximum length. Trimmed before measuring, so
// spaces alone never pass a "required" check.
function str(value, label, { required = false, min = 0, max = 255 } = {}) {
  const v = value === undefined || value === null ? '' : String(value).trim();
  if (!v) return required ? `${label} is required.` : null;
  if (v.length < min)  return `${label} must be at least ${min} characters.`;
  if (v.length > max)  return `${label} must be ${max} characters or fewer.`;
  return null;
}

// A peso amount: a number, never negative, and within a sane ceiling so a typo
// of eight digits cannot land in the accounts.
function money(value, label, { required = false, max = 1000000 } = {}) {
  if (value === undefined || value === null || value === '')
    return required ? `${label} is required.` : null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < 0)               return `${label} cannot be negative.`;
  if (n > max)             return `${label} looks too large — please check it.`;
  return null;
}

// A whole number within a range (ratings, durations, counts).
function int(value, label, { required = false, min = 1, max = 1000 } = {}) {
  if (value === undefined || value === null || value === '')
    return required ? `${label} is required.` : null;
  const n = Number(value);
  if (!Number.isInteger(n))       return `${label} must be a whole number.`;
  if (n < min || n > max)         return `${label} must be between ${min} and ${max}.`;
  return null;
}

// One of a fixed set of words — status values, payment methods, size bands.
// Anything else is rejected before it can reach a query or a CHECK constraint.
function oneOf(value, label, allowed, { required = false } = {}) {
  if (value === undefined || value === null || value === '')
    return required ? `${label} is required.` : null;
  return allowed.includes(String(value)) ? null : `${label} is not a valid choice.`;
}

// 'YYYY-MM-DD', and a real date — 2026-02-31 is rejected.
function date(value, label, { required = false } = {}) {
  if (!value) return required ? `${label} is required.` : null;
  const v = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} must be a valid date.`;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime()) || v !== d.toLocaleDateString('en-CA'))
    return `${label} must be a valid date.`;
  return null;
}

function email(value, label, { required = false } = {}) {
  if (!value) return required ? `${label} is required.` : null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim())
    ? null : `Please enter a valid ${label.toLowerCase()}.`;
}

// The first thing that is wrong, so the person fixes one field at a time
// instead of being handed a wall of messages.
function firstError(results) {
  return results.find(Boolean) || null;
}

module.exports = { str, money, int, oneOf, date, email, firstError };
