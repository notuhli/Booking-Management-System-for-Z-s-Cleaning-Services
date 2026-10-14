# ZClean — Phased Security Plan

**Status:** All 9 phases complete · ready for deployment
**Assessed:** 18 September 2026 · **Last updated:** 10 October 2026
**Scope:** React/Vite client, Express API, Supabase (PostgreSQL), Socket.IO, file uploads

---

## How this plan is sequenced

Nine phases, run one at a time, each approved before the next begins. The ordering
is deliberate: phases 2–4 fix the things an attacker reaches first (identity,
data access, input), and later phases harden what remains. Nothing in phases 2–9
requires a UI change; all of it is server-side or configuration.

| Phase | Focus | Priority | Status |
|---|---|---|---|
| 1 | Security assessment | — | ✅ Done |
| 2 | Authentication & authorization | Critical | ✅ Done |
| 3 | Database security | High | ✅ Done |
| 4 | Input & application security | High | ✅ Done |
| 5 | API & booking security | Critical | ✅ Done |
| 6 | File & data security | High | ✅ Done |
| 7 | Secrets & deployment | Critical | ✅ Done |
| 8 | Testing & verification | High | ✅ Done |
| 9 | Maintenance | Medium | ✅ Done |

### Findings closed

All 23 findings from the Phase 1 assessment are closed.

| Finding | Closed in |
|---|---|
| C1 OTP returned in API response | Phase 2 |
| H1 Socket.IO unauthenticated | Phase 2 |
| H2 Uploaded receipts publicly readable | Phase 6 |
| H3 Upload filenames enumerable | Phase 6 |
| H4 Stored XSS via upload extension | Phase 6 |
| H5 No file size limits | Phase 6 |
| H6 Weak JWT secret | Phase 2 |
| H7 No `.gitignore` | Phase 7 |
| H8 Dependency advisories | Phase 7 |
| M1 Deactivated users keep working tokens | Phase 2 |
| M2 OTP from `Math.random()` | Phase 2 |
| M3 `/reset-password` not rate-limited | Phase 2 |
| M4 No security headers | Phase 4 |
| M5 App connects as database superuser | Phase 3 |
| M6 6-char passwords, no email validation | Phase 2 |
| M7 Error text leaks internals | Phases 2 and 4 |
| M8 `/register` not rate-limited | Phase 2 |
| M9 Credentials duplicated across two `.env` files | Phase 7 |
| M10 `NODE_ENV=development`, localhost `CLIENT_URL` | Phase 7 |
| L1 RLS disabled | Phase 3 |
| L2 `/api/auth/admin-id` public | Phase 5 |
| L3 Rating not validated server-side | Phase 3 |
| L4 Same-millisecond upload collision | Phase 6 |
| L5 7-day JWT, no revocation | Mitigated in Phase 2 |

---

# Phase 1 — Security Assessment

**Objective.** Establish the real security posture of the system by reading the
code rather than assuming, and rank every finding so the remaining phases attack
the right things in the right order.

**Method.** Static review of all 15 controllers, 15 route files, the auth
middleware, the Socket.IO layer, the upload configuration, the Supabase schema,
environment files, and the client bundle. Dependency audit via `npm audit`.

**Result.** 23 findings: **1 Critical, 7 High, 10 Medium, 5 Low** — plus seven
areas that were checked and found genuinely sound.

---

## What is already correct

These were verified, not assumed, and should be stated as strengths in the
defense rather than left unmentioned:

| Area | Evidence |
|---|---|
| **No SQL injection** | 131 `sequelize.query` calls reviewed. Every query carrying user input uses bound `replacements`. The single string-built `WHERE` (service stats) is double-coerced with `parseInt`, so it can only ever contain an integer. |
| **No XSS sinks in the client** | Zero uses of `dangerouslySetInnerHTML`, `innerHTML`, or `eval` across the whole React app. React's default escaping is intact. |
| **REST ownership scoping** | Bookings, messages, reviews and notifications all filter on `req.user.id` taken from the verified token — not from a request parameter. A client cannot read another client's records through the REST API. |
| **Role middleware** | `requireRole` is applied to every admin route. (Since Phase 2 the role is re-read from the database on each request.) |
| **CORS** | Restricted to `CLIENT_URL`, not a wildcard. |
| **Password hashing** | bcrypt, cost factor 10, applied consistently in all six places passwords are set or checked. |
| **Rate limiting (partial)** | `express-rate-limit` already protects login (10 / 15 min) and OTP requests (5 / 15 min). |

---

## 🔴 Critical

### C1 — Password-reset OTP returned in the API response ✅ fixed in Phase 2

`server/controllers/password-reset-controller.js`

When the OTP email fails to send, the endpoint returned the reset code **in the
HTTP response body** as `dev_otp`. The guard was the email error type
(`SMTP_NOT_CONFIGURED`), **not** `NODE_ENV`.

```
POST /api/auth/forgot-password  { "email": "admin@zclean.com" }
→ { "dev_otp": "483916", "dev_mode": true }
→ POST /api/auth/reset-password { email, otp, new_password }
→ attacker owns the admin account
```

**Why it was critical:** it needed no credentials, only a known email address, and
the admin address is guessable. SMTP credentials expiring, being rotated, or
being blanked in a deployment `.env` was enough to open it.

---

## 🟠 High

### H1 — Socket.IO has no authentication ✅ fixed in Phase 2

The websocket trusted whatever the client sent: `join` took a user id from the
browser, so any client could join **any** user's room and receive their live
messages; `send_message` relayed a client-supplied object, allowing a forged
message (e.g. *"Please send your GCash payment to this number instead"*) to
appear in a client's chat as if sent by Z's Cleaning.

### H2 — Uploaded receipts are publicly readable ✅ fixed in Phase 6

`server/index.js` — `app.use('/uploads', express.static(...))`

Served with no authentication. `uploads/receipts/` holds **GCash payment
screenshots** — reference numbers, amounts, sender names. Anyone with a URL could
open one.

### H3 — Upload filenames are enumerable ✅ fixed in Phase 6

`server/utils/upload.js` — `${folder}-${Date.now()}${ext}`

A millisecond timestamp. Combined with H2, receipts were not merely exposed —
they were **discoverable**.

### H4 — Stored XSS via upload extension ✅ fixed in Phase 6

`server/utils/upload.js` — `path.extname(file.originalname)`

The saved extension came from the user's filename, and the type check read
`file.mimetype`, which is the client's `Content-Type` header and is trivially
spoofed. Uploading `payload.html` while claiming `image/png` saved a `.html` file
that `express.static` served as HTML.

### H5 — No file size limits on three of four uploaders ✅ fixed in Phase 6

Only `uploadChatImage` set `limits`. Service images, the GCash QR, and client
booking receipts accepted files of unbounded size.

### H6 — Weak JWT signing secret ✅ fixed in Phase 2

Was `zclean_super_secret_key_2024` — short and guessable. Anyone who recovered it
could mint a `role: "admin"` token. Replaced with a 64-character random value.

### H7 — No `.gitignore` anywhere in the repository ✅ fixed in Phase 7

Both `.env` files were present in the project tree. If pushed to GitHub, the
database password, JWT secret, and Gmail app password would be published.

### H8 — Three high-severity dependency advisories ✅ fixed in Phase 7

`npm audit`: `socket.io-parser` (DoS), `nodemailer` (misdelivery), `ip-address`
(SSRF, transitive).

---

## 🟡 Medium

| # | Finding | Status |
|---|---|---|
| M1 | Deactivated users keep working tokens for up to 7 days. | ✅ Phase 2 |
| M2 | OTP uses `Math.random()`. | ✅ Phase 2 |
| M3 | `/reset-password` not rate-limited — OTP brute-forceable. | ✅ Phase 2 |
| M4 | No security headers (`helmet` not installed). | ✅ Phase 4 |
| M5 | Database connects as the Postgres superuser. | ✅ Phase 3 |
| M6 | 6-character passwords, no email-format validation. | ✅ Phase 2 |
| M7 | Error messages leak internals (SMTP, raw DB errors). | ✅ Phases 2 and 4 |
| M8 | `/register` not rate-limited. | ✅ Phase 2 |
| M9 | Credentials duplicated across two `.env` files. | ✅ Phase 7 |
| M10 | `NODE_ENV=development`, `CLIENT_URL` on localhost. | ✅ Phase 7 |

---

## 🟢 Low

| # | Finding | Status |
|---|---|---|
| L1 | Row Level Security disabled on all tables. | ✅ Phase 3 |
| L2 | `/api/auth/admin-id` is public. | ✅ Phase 5 |
| L3 | Review `rating` not validated server-side. | ✅ Phase 3 |
| L4 | Two uploads in the same millisecond overwrite each other. | ✅ Phase 6 |
| L5 | 7-day JWT, no refresh or revocation. | Mitigated in Phase 2 (per-request account check) |

---

# Phase 2 — Authentication & Authorization ✅

**Objective.** Make identity trustworthy: a token must prove who the user is
*now*, not who they were a week ago.

**Risks addressed.** C1, H1, H6, M1, M2, M3, M6, M8, L5 (mitigated).

**What was done.**
1. `dev_otp` only returned when `NODE_ENV !== 'production'`; raw SMTP error text
   removed from responses and logged server-side (C1, M7 partial).
2. `JWT_SECRET` replaced with a 64-character random value (H6). *All existing
   sessions were invalidated once as a result.*
3. OTPs generated with `crypto.randomInt` (M2).
4. `/reset-password` rate-limited with the OTP limiter; `/register` limited to
   5 accounts per IP per hour (M3, M8).
5. `authenticate` re-reads the account on every request: deactivation is
   immediate and the role comes from the database, not the token (M1, L5).
6. Password minimum raised to 8 characters in all 11 places it is enforced or
   displayed; email format validated on registration (M6).
7. Socket.IO handshake requires the JWT; the room and `sender_id` are derived
   from the verified token and any client-supplied id is ignored. The client
   sends the token via `auth: (cb) => cb({ token })`, re-read on every
   reconnect (H1).

**Files changed.** `middleware/auth-middleware.js`, `controllers/auth-controller.js`,
`controllers/password-reset-controller.js`, `controllers/profile-controller.js`,
`routes/auth-routes.js`, `server/index.js`, `server/.env`,
`client/src/services/socket.js`, `ForgotPasswordPage.jsx`, `RegisterPage.jsx`,
`client/ProfilePage.jsx`.

**Testing.** Request a reset with SMTP disabled and confirm no OTP is returned;
deactivate an account mid-session and confirm the next request is rejected;
connect a socket with no token and confirm it is refused; confirm chat still
works in both directions after logging in.

**Known limitation.** Registration checks email *format* only, not that the
mailbox exists. Email verification by OTP was proposed and is on hold pending
the team's decision.

---

# Phase 3 — Database Security ✅

**Objective.** Ensure the database enforces its own rules rather than trusting
the application alone.

**Risks addressed.** M5, L1, L3.

**What was done.**
1. **Least-privilege role.** `migration_v12_least_privilege.sql` creates
   `zclean_app`, which can only SELECT / INSERT / UPDATE / DELETE rows. The
   server code was checked first: it runs no DDL at runtime (no `CREATE`,
   `ALTER`, `DROP`, `TRUNCATE`, or `sync()`), so it loses nothing. Default
   privileges ensure tables added by future migrations are granted
   automatically (M5).
2. **RLS enabled on every table** with one allow-all policy for `zclean_app`
   and none for Supabase's `anon` / `authenticated` roles, whose table grants
   are also revoked. Supabase's public REST API can read nothing. Per-user rules
   remain in the Express API — see `DECISIONS.md` #9 for why (L1).
3. **Rating validated server-side** as a whole number 1–5 before the insert,
   so a bad value gets a clear 400 rather than a 500 from the constraint (L3).
4. **Bug fixed alongside:** a duplicate review was detected only by MySQL's
   `'Duplicate'` error text, so on Postgres a second review returned 500 instead
   of 409 "Already reviewed". Now also matches Postgres code `23505`.
5. **Live constraints verified.** The migration's final query lists every table
   with its RLS status, policy, foreign-key count and check-constraint count.

**Files changed.** `database/migration_v12_least_privilege.sql` (new),
`server/controllers/review-controller.js`, `server/.env` (`DATABASE_URL` user
and password), `DECISIONS.md`.

**Testing.** In the SQL editor, `SET ROLE zclean_app; DROP TABLE reviews;` →
*must be denied* (then `RESET ROLE;`). Use every page of the app and confirm
nothing returns "permission denied". Submit a review with rating 7 via a direct
request → 400. Submit a second review for the same booking → 409.

**Rollback.** Put the old `postgres.<ref>` user back in `DATABASE_URL` and
restart. Nothing in the migration needs undoing.

---

# Phase 4 — Input & Application Security ✅

**Objective.** Reject malformed and hostile input at the boundary, on the server,
regardless of what the UI allows.

**Risks addressed.** M4, M7, plus defence-in-depth for XSS.

**What was done.**
1. **`helmet` installed** with two deliberate exceptions:
   - `contentSecurityPolicy: false` — the default policy blocks Vite's inline
     styles and would break the UI. The app has no XSS sink (verified in
     Phase 1), so the remaining headers carry the value.
   - `crossOriginResourcePolicy: { policy: 'cross-origin' }` — the default
     `same-origin` would block **every image** on the site, because the client
     and the API are on different origins (M4).
2. **Shared validation helper** — `server/utils/validate.js`, with `str`,
   `money`, `int`, `oneOf`, `date`, `email` and `firstError`. Applied to all
   **12 write endpoints**: types, lengths, ranges and enum membership are now
   checked before any query runs.
3. **Generic error messages.** Raw `e.message` removed from responses
   (`replyReview` and others); the detail is logged server-side instead (M7).
4. **Request body capped** at `express.json({ limit: '1mb' })` — an oversized
   JSON body is rejected before it is parsed.
5. **Re-confirmed** no `dangerouslySetInnerHTML`, `innerHTML` or `eval` has
   been introduced anywhere in the client.

**Files changed.** `server/utils/validate.js` (new), `server/index.js`, 12
controllers.

**Testing.** Oversized strings, wrong types and out-of-range numbers submitted
to each write endpoint → 400 with a clear message, data unchanged.

---

# Phase 5 — API & Booking Security ✅

**Objective.** Ensure booking rules hold against a manipulated request, not just
against the UI.

**Risks addressed.** Booking manipulation, L2, remaining rate-limit gaps.

**What was done.**
1. **Ownership re-verified** on every `:id` route by direct request with another
   client's token — bookings, messages, reviews and notifications all refuse.
2. **Global rate limiter** — 300 requests per 15 minutes on `/api`, on top of
   the existing tighter limits on login, OTP and registration.
   `app.set('trust proxy', process.env.TRUST_PROXY || 'loopback')` makes the
   limiter read the real client address behind a host's proxy. **`true` was
   deliberately rejected**: it trusts any `X-Forwarded-For` header, which would
   let anyone spoof an address and bypass every rate limit.
3. **`/api/auth/admin-id` now requires authentication** (L2).
4. **Prices are recomputed server-side.** `area_surcharge` and `transport_fee`
   are derived from the service price, the stored percentages and the
   per-barangay table — the request body is never trusted. The authoritative
   total is service + add-ons + area surcharge + transport fee, computed by the
   same SQL everywhere it appears.
5. **Concurrent double-booking blocked** with a database advisory lock —
   `pg_advisory_xact_lock(hashtext(?))` on PostgreSQL, `GET_LOCK` on MySQL —
   taken on the date before the capacity re-check inside the transaction. Two
   simultaneous requests for the last slot now serialise, and the second is
   refused.

**Files changed.** `controllers/booking-controller.js`, `routes/auth-routes.js`,
`server/index.js`, `server/.env` (`TRUST_PROXY`).

**Testing.** Booking requests replayed with an altered `client_id`, altered
prices and a blocked date → each rejected, server value wins.

---

# Phase 6 — File & Data Security ✅

**Objective.** Treat uploads as untrusted, and payment receipts as private.

**Risks addressed.** H2, H3, H4, H5, L4.

**What was done.**
1. **Size limits on all four uploaders** — 5 MB each (H5).
2. **Filenames from `crypto.randomUUID()`**, with the extension taken from a
   mimetype→extension whitelist rather than the user's filename. Unguessable,
   and two uploads in the same millisecond can no longer collide (H3, H4, L4).
3. **Real file type verified by magic bytes.** A `verifyImage` middleware reads
   the first bytes of the saved file; anything that is not genuinely an image is
   deleted from disk and refused (H4).
4. **Receipts moved behind an authenticated guard.**
   `server/middleware/receipt-guard.js` is mounted on `/uploads/receipts`
   **before** the static handler. The admin sees all; a client sees only the
   receipt attached to their own booking.
   Because a browser will not send an `Authorization` header on an `<img>` tag,
   the token travels as `?t=<token>` and the client builds the URL with a
   `receiptSrc()` helper (H2).
5. **Service images and the GCash QR stay public** — they are meant to be.

**Files changed.** `server/utils/upload.js` (rewritten),
`server/middleware/receipt-guard.js` (new), `server/index.js`,
`client/src/services/api.js`, `client/src/pages/client/BookingHistory.jsx`.

**Testing.** An HTML file disguised as a PNG → rejected and deleted. Another
client's receipt URL while logged in as a different client → 403. A 100 MB
file → rejected.

---

# Phase 7 — Secrets & Deployment Security ✅

**Objective.** Ensure no credential is reachable from a repository, a bundle, or
a response — and that the production configuration differs from development.

**Risks addressed.** H7, H8, M9, M10.

**What was done.**
1. **`.gitignore` added** covering `.env`, `node_modules`, `dist`, `uploads`
   and build output (H7).
2. **Credentials rotated** — the JWT secret in Phase 2, the database user in
   Phase 3.
3. **`server/.env.example` created** with every key present and every value
   blank, including `TRUST_PROXY`, so the project can be handed over without a
   single secret.
4. **`npm audit fix` run** and re-audited; the three high-severity advisories
   are closed (H8).
5. **Deployment configuration documented** (M9, M10) — see below.

**Deployment checklist.**

| Setting | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Hides detailed errors from strangers. |
| `CLIENT_URL` | the real site address | CORS blocks the frontend otherwise. |
| `TRUST_PROXY` | `1` behind a host proxy; omit locally | Rate limits read the real client address. |
| Start directory | `cd server && node index.js` | dotenv reads `.env` from the working directory. Starting from the project root picks up the **root** `.env`, which has no `DATABASE_URL` — the app then falls back to MySQL mode and silently cannot see Supabase. |
| Root `.env` | **delete it** | Removes the duplicate entirely (M9). |
| HTTPS | enabled at the host | HSTS is already set by helmet. |

**Testing.** `git status` shows no `.env`; the built client bundle greps clean
for every secret.

---

# Phase 8 — Testing & Security Verification ✅

**Objective.** Make every fix demonstrable — which is what a panel will ask for.

**What was done.** `SECURITY-TESTING.md` was written: **33 checks**, each with
the exact request to make, the expected result, and a box to tick. It covers
authentication, authorization, data isolation, deactivation, the database role,
SQL injection, XSS, websockets, uploads, file access, booking rules, rate limits
and secrets.

| Area | Test | Expected |
|---|---|---|
| Authentication | Call a protected endpoint with no token | 401 |
| Authentication | Call with an expired or edited token | 401 |
| Authorization | Call an admin endpoint as a client | 403 |
| Data isolation | Request another client's booking by id | 403 / 404 |
| Data isolation | Request another client's messages | Empty result |
| Deactivation | Deactivate mid-session, then call any endpoint | 403 |
| Database role | `SET ROLE zclean_app; DROP TABLE reviews;` | Permission denied |
| SQL injection | Submit `' OR 1=1 --` in search and login | Treated as literal text |
| XSS | Submit `<script>alert(1)</script>` as a review | Rendered as text |
| Websocket | Connect with no token | Refused |
| Upload | Upload `.html` disguised as an image | Rejected |
| Upload | Upload a 100 MB file | Rejected |
| File access | Open another client's receipt URL | 403 |
| Booking | POST with a blocked date, a past date, a full date | 409 / 400 |
| Booking | POST with an altered `client_id` or price | Server value wins |
| Rate limit | 15 rapid login attempts | 429 after 10 |
| Secrets | Grep the client bundle for each secret | Zero matches |

The file also records the **known limitations** honestly, which is better
defended than hidden: no email-address verification at registration, a 7-day
token with no revocation list (mitigated by the per-request account check), and
no automatic database backups (addressed as a routine in Phase 9).

**Files changed.** `SECURITY-TESTING.md` (new).

---

# Phase 9 — Maintenance ✅

**Objective.** Keep the system secure after the code stops changing.

**What was done.** `MAINTENANCE.md` was written as a routine the owner or the
student team can follow without a developer:

| Routine | How often | Time |
|---|---|---|
| **Supabase CSV export + keep-awake** | **Weekly** | 5 min |
| `npm audit` on server and client | Monthly | 5 min |
| Log review for repeated 401 / 403 / 429 | Monthly | 5 min |
| Full `SECURITY-TESTING.md` run | Each term / before a demo | 1 hour |
| Account review (deactivate test accounts) | Each term | 10 min |
| Credential rotation | End of project, or on exposure | 15 min |

The weekly export is the most important item: **the project has no automatic
backups**, and a Supabase free-tier project **pauses after about 7 days of
inactivity**, which is what produced the `getaddrinfo ENOTFOUND` failure during
development. Signing in to export therefore backs the data up *and* keeps the
project awake. Ten tables are listed by name, with 4 weeks of dated folders
kept in Google Drive.

`MAINTENANCE.md` also documents which of the four credentials to rotate, where
each lives, and what breaks when it changes.

**Files changed.** `MAINTENANCE.md` (new).

---

## Status

All nine phases are complete and all 23 findings are closed. The remaining open
item is **email-address verification at registration**, deferred by team
decision and recorded as a known limitation rather than left unstated.
