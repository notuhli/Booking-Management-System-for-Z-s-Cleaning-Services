# ZClean — Maintenance Routine

**Phase 9 of the security plan.** Everything before this phase fixed the system.
This phase keeps it fixed after the code stops changing.

Four routines, ordered by how often they run. None of them needs a developer —
the owner or the student team can do all of it.

---

## ⚠️ Weekly — Back up the database (most important)

**There are currently no backups.** Supabase's free tier does not include
automatic backups, and a free project **pauses after about 7 days with no
activity**. A paused project stops resolving its hostname entirely, which is
exactly the `getaddrinfo ENOTFOUND` error seen during development.

So this routine does two jobs at once: it produces a backup, *and* the act of
logging in keeps the project awake.

**Every Sunday (about 5 minutes):**

1. Open the Supabase dashboard and sign in. This alone resets the inactivity
   timer.
2. Table Editor → for each table below, click the table, then **Export → CSV**:

   | Table | Why it matters |
   |---|---|
   | `users` | Client accounts. Passwords are bcrypt hashes — safe to export. |
   | `bookings` | The business record. Irreplaceable. |
   | `payments` | Money received. Irreplaceable. |
   | `expenses` | Money spent. Irreplaceable. |
   | `services` | Packages and prices. |
   | `global_addons` | Add-on list and prices. |
   | `transport_fees` | Per-barangay fees. |
   | `settings` | GCash details, surcharge percentages, reservation fee. |
   | `reviews` | Client feedback. |
   | `blocked_dates` | Calendar blocks. |

3. Put the CSVs in a dated folder — `backup-2026-10-12/` — in Google Drive, not
   only on one laptop.

**Keep at least the last 4 weeks.** Older than that can be deleted.

`messages` and `notifications` are not on the list on purpose: they are large,
they regenerate, and losing them does not affect the business record. Export
them too if you have time.

> **If the project has already paused:** open the dashboard and click *Restore*.
> Nothing is lost — pausing is not deletion — but the site is down until you do.

---

## Monthly — Check for vulnerable packages

A dependency with a published flaw is the most likely way this system gets
attacked, because it needs no knowledge of ZClean specifically.

```bash
cd server && npm audit
cd ../client && npm audit
```

- **Critical or High** → `npm audit fix`, then start the server and click
  through booking, chat and reports to confirm nothing broke.
- **Moderate or Low** → note it; fix at the next convenient point.
- **`npm audit fix --force` — do not run it.** It installs major-version
  upgrades that will break the code.

Record the date and result, so there is evidence the routine is being followed.

---

## Monthly — Read the logs

Look at the server's console output or your host's log page and scan for:

| What you see | What it means | What to do |
|---|---|---|
| Many `401` from one address | Someone guessing passwords | Rate limiting is already stopping them. Watch it. |
| Many `429` | The rate limiter is firing | Normal if a real user is impatient. Repeated from one address = probing. |
| Repeated `403` on admin routes | A client account trying admin endpoints | Deactivate that account and change the admin password. |
| `500` on the same endpoint | A real bug | Note the endpoint and the time. |

Nothing here is an emergency on its own. The point is to notice a pattern early.

---

## Each term / before each demo

1. **Re-run `SECURITY-TESTING.md`.** All 33 checks. This is what proves the
   controls still work after months of changes, and it is the evidence to show a
   panel.
2. **Review accounts.** Supabase → `users`. Any test account still active?
   Deactivate it. Any client who asked to be removed? Deactivate rather than
   delete, so their bookings and payments stay in the financial reports.
3. **Run `database/preflight_check.sql`** after any migration, to confirm the
   schema still has everything the code expects.

---

## Rotate credentials

**When:** at the end of the project, when a team member leaves the group, or
immediately if a password is ever pasted into a chat, a screenshot, a document,
or a public repository.

There are four, and each has a different consequence:

| Credential | Where | Effect of changing it |
|---|---|---|
| `JWT_SECRET` | `server/.env` | **Everyone is logged out once.** Harmless. |
| `zclean_app` password | Supabase → Database → Roles, then `DATABASE_URL` | Server can't connect until `.env` is updated. Change both together. |
| `postgres` password | Supabase → Settings → Database | Only used for migrations, not by the app. |
| Gmail app password | Google Account → App passwords | Emails stop sending until `.env` is updated. |

After any change: restart the server fully (Ctrl+C, then start again — a reload
does not re-read `.env`), then send a test reset email and log in once.

---

## Never commit secrets

`.gitignore` already excludes `.env`, `node_modules`, `dist` and `uploads`.
Before any push:

```bash
git status
```

If a `.env` appears in that list, stop and fix `.gitignore` before committing.
If one has **already** been pushed, deleting it in a later commit does not
help — it stays in the history. Rotate all four credentials above instead.

---

## Quick reference

| Routine | How often | Time |
|---|---|---|
| Supabase CSV export + keep-awake | **Weekly** | 5 min |
| `npm audit` | Monthly | 5 min |
| Log review | Monthly | 5 min |
| `SECURITY-TESTING.md` full run | Each term / before a demo | 1 hour |
| Account review | Each term | 10 min |
| Credential rotation | End of project, or on exposure | 15 min |
