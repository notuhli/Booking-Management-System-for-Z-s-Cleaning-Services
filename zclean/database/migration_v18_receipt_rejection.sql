-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v18: rejecting a GCash receipt
--
-- WHY
--   When a client uploads a GCash receipt the booking goes to
--   'pending_verification' and waits for the admin. The admin could only ever
--   VERIFY it. If the receipt was fake, altered, for the wrong amount, or for a
--   payment that never arrived, there was no action that said so: clicking
--   Verify would confirm a booking that was never paid for, and clicking
--   nothing left the booking sitting in 'pending_verification' indefinitely
--   while the client believed it was being processed.
--
-- WHAT IT ADDS
--   1. payment_status may now also be 'rejected' — the admin looked at the
--      receipt and turned it down. This is deliberately NOT the same as
--      'unpaid': 'unpaid' means no payment was ever submitted, 'rejected'
--      means one was submitted and refused. The client sees which.
--   2. receipt_rejected_reason — the short reason the admin gives, shown to the
--      client so a rejection is never silent (e.g. "amount is short",
--      "reference number not found in our GCash record").
--   3. receipt_rejected_at — when it was rejected.
--   4. gcash_reference — the GCash reference number the client types when
--      uploading. Verifying an image really means checking that this reference
--      and amount actually arrived in the business GCash account, and a
--      reference number cannot be invented the way a screenshot can.
--      Nullable: receipts already uploaded have none, and nothing breaks.
--
--   No booking, payment or amount is changed by running this. Every existing
--   booking keeps the status it already has.
--
-- WHAT THE APPLICATION SHOULD DO ON REJECT (for reference — code, not SQL)
--   • payment_status  -> 'rejected'
--   • status          -> stays 'pending'; the booking is NOT confirmed and the
--                        schedule slot is not held
--   • gcash_receipt   -> LEFT IN PLACE. The uploaded file is the evidence if
--                        the attempt really was fraudulent. It is replaced only
--                        when the client uploads a new one.
--   • the client is notified in-app and by email with the reason, and may
--     upload a new receipt, which returns the booking to
--     'pending_verification'.
--
-- HOW TO RUN
--   Supabase -> SQL Editor -> paste this whole file -> Run.
--   Safe to run more than once.
--
-- ROLLBACK
--   The three columns are nullable and the constraint only widens, so leaving
--   this in place breaks nothing even if the feature is not shipped. To undo:
--     UPDATE bookings SET payment_status = 'unpaid' WHERE payment_status = 'rejected';
--     ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
--     ALTER TABLE bookings ADD  CONSTRAINT bookings_payment_status_check
--       CHECK (payment_status IN ('unpaid','pending_verification','partial','paid'));
--     ALTER TABLE bookings DROP COLUMN IF EXISTS receipt_rejected_reason;
--     ALTER TABLE bookings DROP COLUMN IF EXISTS receipt_rejected_at;
--     ALTER TABLE bookings DROP COLUMN IF EXISTS gcash_reference;
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Allow the new status ─────────────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD  CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('unpaid','pending_verification','partial','paid','rejected'));


-- ── 2. Why it was rejected, and when ────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS receipt_rejected_reason VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS receipt_rejected_at     TIMESTAMPTZ;

-- A rejection must say why. This allows the reason to be absent only while the
-- booking is not in the rejected state, so a silent rejection cannot be stored.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_rejection_reason_check;
ALTER TABLE bookings ADD  CONSTRAINT bookings_rejection_reason_check
  CHECK (
    payment_status <> 'rejected'
    OR (receipt_rejected_reason IS NOT NULL AND btrim(receipt_rejected_reason) <> '')
  );


-- ── 3. The GCash reference number ───────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcash_reference VARCHAR(50);

-- Finding a booking by the reference the admin reads off their GCash app.
CREATE INDEX IF NOT EXISTS idx_bookings_gcash_reference
  ON bookings (gcash_reference)
  WHERE gcash_reference IS NOT NULL;


-- ── 4. Check ────────────────────────────────────────────────────────────────
-- Right after running this: the three columns exist, and no booking is
-- 'rejected' yet, which is correct.
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name IN ('receipt_rejected_reason','receipt_rejected_at','gcash_reference')
  )                                                              AS new_columns_present,
  (SELECT COUNT(*) FROM bookings WHERE payment_status = 'rejected') AS rejected_bookings,
  (SELECT check_clause FROM information_schema.check_constraints
    WHERE constraint_name = 'bookings_payment_status_check')     AS payment_status_rule;
