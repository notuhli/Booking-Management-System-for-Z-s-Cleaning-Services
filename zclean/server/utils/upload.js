const multer  = require('multer');
const crypto  = require('crypto');
const storage = require('./storage');

// ── Uploads ──────────────────────────────────────────────────────────────────
// Everything a person can put on this server comes through here, so all of it
// is treated as hostile until proven otherwise.
//
// Three things used to be wrong:
//
//  1. The saved EXTENSION came from the user's own filename. Uploading
//     `payload.html` while the browser claimed `image/png` saved a real .html
//     file, which express.static then served as HTML — script and all — from
//     this server's own origin. A stored cross-site scripting hole.
//
//  2. The type check read `file.mimetype`, which is just the Content-Type
//     header the client sent. It is one line to change in any HTTP tool, so on
//     its own it proves nothing.
//
//  3. Filenames were `receipts-<millisecond timestamp>.jpg`. If you know
//     roughly when a booking was made, that is a few thousand guesses — so the
//     payment receipts were not merely public, they were findable.
//
// Now: the extension comes from a whitelist keyed on type, the name is a random
// UUID, every uploader has a size limit, and `verifyImage` below re-opens the
// saved file and checks its actual first bytes.

// The only types accepted, and the extension each one is saved with.
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/gif':  '.gif',
};

const MAX_BYTES = 5 * 1024 * 1024;   // 5 MB — comfortably above a phone photo

// Files are held in memory first, then handed to storage.js. Previously multer
// wrote straight to disk, which on an ephemeral host meant the file was gone
// after the next restart. Buffering also lets the magic-byte check below run
// BEFORE anything is stored, so a disguised file never lands anywhere at all.
const makeStorage = () => multer.memoryStorage();

// The name we give the file: random, with an extension WE choose from the
// whitelist — never the user's filename. Also fixes two uploads in the same
// millisecond overwriting each other.
const makeName = (folder, mimetype) =>
  `${folder}-${crypto.randomUUID()}${ALLOWED[mimetype] || '.bin'}`;

const imageFilter = (req, file, cb) => {
  if (ALLOWED[file.mimetype]) cb(null, true);
  else cb(new Error('Only JPG, PNG, WebP or GIF images are allowed.'), false);
};

const makeUploader = (folder) => {
  const mw = multer({
    storage: makeStorage(),
    fileFilter: imageFilter,
    limits: { fileSize: MAX_BYTES, files: 1 },
  });
  // Remember which folder this uploader is for, so verifyImage knows where to
  // store the file once it has proved to be a real image.
  const wrap = (handler) => (req, res, next) => {
    req._uploadFolder = folder;
    handler(req, res, next);
  };
  return { single: (field) => wrap(mw.single(field)) };
};

// ── verifyImage ──────────────────────────────────────────────────────────────
// Runs AFTER multer has written the file, and checks what the bytes actually
// are. A file's first few bytes identify its real format ("magic numbers"), and
// unlike the Content-Type header they cannot be talked out of. Anything that
// isn't a real image is deleted from disk and the request refused.
const SIGNATURES = [
  { ext: '.jpg',  bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { ext: '.gif',  bytes: [0x47, 0x49, 0x46, 0x38] },                        // GIF8
  // WebP is "RIFF" .... "WEBP"; the size sits between, so it is checked in two parts.
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] },
];

const looksLikeImage = (buf) => SIGNATURES.some(sig => {
  if (!sig.bytes.every((b, i) => buf[i] === b)) return false;
  if (sig.at8) return sig.at8.every((b, i) => buf[8 + i] === b);
  return true;
});

// The check now runs on the in-memory buffer, BEFORE the file is stored, so a
// disguised file is refused without ever being written. Only once it has proved
// to be a real image is it handed to storage.js, which puts it in Supabase
// Storage when deployed and on local disk otherwise.
const verifyImage = async (req, res, next) => {
  if (!req.file) return next();               // nothing uploaded — not our problem
  try {
    if (!looksLikeImage(req.file.buffer)) {
      return res.status(400).json({
        message: 'That file is not a valid image. Please upload a JPG, PNG, WebP or GIF.',
      });
    }

    const folder   = req._uploadFolder || 'misc';
    const filename = makeName(folder, req.file.mimetype);

    await storage.put(folder, filename, req.file.buffer, req.file.mimetype);

    // The controllers build their URL from `filename`, exactly as before, so
    // nothing downstream of here had to change.
    req.file.filename = filename;
    req.file.folder   = folder;
    delete req.file.buffer;                   // don't carry 5 MB any further

    next();
  } catch (e) {
    console.error('verifyImage/store error:', e.message);
    res.status(500).json({ message: 'Could not save the uploaded file. Please try again.' });
  }
};

// ── uploadError ──────────────────────────────────────────────────────────────
// multer throws for an oversized or wrong-typed file, and without this the
// client saw a generic 500 with no idea what to fix.
const uploadError = (err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ message: 'That image is too large. Please upload one under 5 MB.' });
  if (err.message?.includes('allowed'))
    return res.status(400).json({ message: err.message });
  console.error('upload error:', err.message);
  res.status(400).json({ message: 'Upload failed. Please try again.' });
};

exports.uploadServiceImage = makeUploader('services');
exports.uploadGcashQr      = makeUploader('gcash');
exports.uploadReceipt      = makeUploader('receipts');
exports.uploadChatImage    = makeUploader('chat');
exports.verifyImage        = verifyImage;
exports.uploadError        = uploadError;
exports.ALLOWED_TYPES      = ALLOWED;
