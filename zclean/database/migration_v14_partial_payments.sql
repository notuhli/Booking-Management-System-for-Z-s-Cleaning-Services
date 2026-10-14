-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v14: partial payments (reservation fee)
--
-- WHY
--   Clients pay a ₱500 reservation by GCash to hold a booking, but the database
--   only allowed 'unpaid', 'pending_verification' and 'paid'. Any recorded
--   payment therefore marked the whole booking PAID, and marking the job done
--   promoted it to COMPLETED — so a booking with ₱6,800 still owed looked fully
--   settled. This adds the missing middle state.
--
-- WHAT IT CHANGES
--   1. payment_status may now also be 'partial'.
--   2. A 'reservation_fee' setting (₱500) the owner can edit in the app.
--   3. Existing bookings are re-checked: any marked 'paid' that have received
--      less than their total are corrected to 'partial', and a 'completed'
--      booking that is not fully paid goes back to 'done' (performed, unpaid).
--
--   No booking, payment or amount is deleted or altered — only the two status
--   columns are corrected to match the money already recorded.
--
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Allow the new status ─────────────────────────────────────────────────
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD  CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('unpaid','pending_verification','partial','paid'));


-- ── 2. The reservation amount ───────────────────────────────────────────────
INSERT INTO settings (setting_key, setting_value)
VALUES ('reservation_fee', '500')
ON CONFLICT (setting_key) DO NOTHING;


-- ── 3. Correct bookings that were marked paid on a part-payment ─────────────
WITH totals AS (
  SELECT b.id,
         s.price
           + COALESCE((
               SELECT SUM(ga.price) FROM booking_global_addons bga
               JOIN global_addons ga ON ga.id = bga.addon_id
               WHERE bga.booking_id = b.id
             ), 0)
           + COALESCE(b.area_surcharge, 0)
           + COALESCE(b.transport_fee, 0)                       AS total,
         (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
           WHERE p.booking_id = b.id)                           AS paid
  FROM bookings b
  JOIN services s ON s.id = b.service_id
)
UPDATE bookings b
SET payment_status = CASE
      WHEN t.paid + 0.005 >= t.total AND t.total > 0 THEN 'paid'
      WHEN t.paid > 0                                THEN 'partial'
      WHEN b.payment_status = 'pending_verification' THEN 'pending_verification'
      ELSE 'unpaid'
    END
FROM totals t
WHERE t.id = b.id
  AND b.status <> 'cancelled';

-- A booking can only be 'completed' (performed AND settled) when fully paid.
UPDATE bookings SET status = 'done'
WHERE status = 'completed' AND payment_status <> 'paid';


-- ── 4. Check ────────────────────────────────────────────────────────────────
-- How the bookings now sit. 'partial' rows are the ones that were previously
-- being reported as fully paid.
SELECT payment_status, status, COUNT(*) AS bookings
FROM bookings
GROUP BY payment_status, status
ORDER BY payment_status, status;
