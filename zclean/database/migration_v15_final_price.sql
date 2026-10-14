-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v15: final price after the ocular inspection
--
-- WHY
--   The business visits the house before the cleaning day and agrees the real
--   price there. Until now the system had no place to put that figure, so every
--   booking, receipt and report used the ESTIMATE calculated at booking time —
--   a number the customer may never have actually been charged.
--
-- WHAT IT ADDS  (three nullable columns; nothing existing is changed)
--   final_price  the amount agreed after the inspection. NULL means the
--                booking is still on its estimate.
--   price_note   why it differs, e.g. "3-storey, extra crew". Shown to the
--                client on the receipt, so a change is never silent.
--   priced_at    when it was set.
--
--   Every existing booking keeps NULL, so nothing recalculates and no past
--   figure moves. From here on, a booking's total is:
--       COALESCE(final_price, service + add-ons + area surcharge + transport)
--
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_price NUMERIC(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_note  VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS priced_at   TIMESTAMP;

-- A final price is a real amount, never negative.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_final_price_check;
ALTER TABLE bookings ADD  CONSTRAINT bookings_final_price_check
  CHECK (final_price IS NULL OR final_price >= 0);

-- Check: all NULL right after running this, which is correct.
SELECT COUNT(*) AS bookings,
       COUNT(final_price) AS with_final_price
FROM bookings;
