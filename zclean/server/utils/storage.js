const fs   = require('fs');
const path = require('path');

// ── Where uploaded files actually live ───────────────────────────────────────
// Two routes, chosen automatically — the same pattern as the database and the
// mailer:
//
//   SUPABASE_URL + SUPABASE_SERVICE_KEY set
//       → Supabase Storage. Used in deployment, because a host like Render's
//         free tier gives the app an EPHEMERAL disk: every restart, deploy or
//         sleep resets it to whatever came out of git. Files written at runtime
//         — service photos, the GCash QR, chat images and payment receipts —
//         silently disappear, while the database keeps pointing at them. A
//         missing receipt is the serious one: the admin cannot verify a payment
//         that no longer exists, and only the client could upload it again.
//
//   otherwise
//       → the local uploads/ folder, exactly as before. Development needs no
//         Supabase Storage setup and behaves unchanged.
//
// ── Why one PRIVATE bucket, proxied through this server ──────────────────────
// Everything is fetched back through our own /uploads route rather than from a
// public Supabase URL. That keeps receipt-guard working unchanged: a client can
// still only open the receipt attached to their own booking. It also means the
// stored URLs in the database do not change, so no migration and no client-side
// change is needed.

const BUCKET   = process.env.SUPABASE_BUCKET || 'zclean-uploads';
const BASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY      = (process.env.SUPABASE_SERVICE_KEY || '').trim();

const useSupabase = () => !!(BASE_URL && KEY);

const objectUrl = (folder, filename) =>
  `${BASE_URL}/storage/v1/object/${BUCKET}/${folder}/${encodeURIComponent(filename)}`;

const authHeaders = () => ({
  Authorization: `Bearer ${KEY}`,
  apikey:        KEY,
});

const localPath = (folder, filename) =>
  path.join(__dirname, '..', 'uploads', folder, path.basename(filename));

// ── put ──────────────────────────────────────────────────────────────────────
// Saves the bytes and resolves once they are durably stored. Throws on failure,
// so a controller never records a filename for a file that was not written.
async function put(folder, filename, buffer, contentType) {
  if (!useSupabase()) {
    const dir = path.join(__dirname, '..', 'uploads', folder);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(localPath(folder, filename), buffer);
    return;
  }

  if (typeof fetch !== 'function')
    throw new Error('Node 18 or newer is required for Supabase Storage.');

  const res = await fetch(objectUrl(folder, filename), {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': contentType || 'application/octet-stream',
      'cache-control': '3600',
      'x-upsert': 'true',
    },
    body: buffer,
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

// ── get ──────────────────────────────────────────────────────────────────────
// Returns { buffer, contentType } or null when the object does not exist.
async function get(folder, filename) {
  if (!useSupabase()) {
    try {
      const buffer = await fs.promises.readFile(localPath(folder, filename));
      return { buffer, contentType: contentTypeFor(filename) };
    } catch { return null; }
  }

  const res = await fetch(objectUrl(folder, filename), {
    headers: authHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get('content-type') || contentTypeFor(filename),
  };
}

// ── remove ───────────────────────────────────────────────────────────────────
// Best-effort. Used when a file turns out not to be a real image, so a failure
// to clean up must never fail the request that is already being refused.
async function remove(folder, filename) {
  try {
    if (!useSupabase()) {
      await fs.promises.unlink(localPath(folder, filename));
      return;
    }
    await fetch(objectUrl(folder, filename), {
      method: 'DELETE',
      headers: authHeaders(),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* nothing depends on this succeeding */ }
}

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                '.webp': 'image/webp', '.gif': 'image/gif' };
const contentTypeFor = (filename) =>
  TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';

module.exports = { put, get, remove, useSupabase, contentTypeFor, BUCKET };
