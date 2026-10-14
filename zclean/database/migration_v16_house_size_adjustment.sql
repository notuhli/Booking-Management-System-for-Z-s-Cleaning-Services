-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v16: house size correction after the ocular inspection
--
-- REPLACES migration v15. Run this whether or not v15 was run.
--
-- WHY THE CHANGE
--   v15 added a `final_price` column that replaced a booking's whole total with
--   one number. That hid where the figure came from: the client saw a total
--   that no longer matched the itemised lines above it.
--
--   The real correction after an inspection is the HOUSE SIZE. Booking already
--   stores `sqm_range` and `area_surcharge`, so the admin now corrects those
--   two and the total recalculates itself:
--       service + area charge + add-ons + transport fee
--   The receipt keeps adding up, and the client sees which line changed.
--
-- WHAT THIS DOES
--   • keeps `price_note` (why it changed — shown to the client) and
--     `priced_at` (when the inspection was recorded);
--   • drops `final_price`, which nothing uses any more.
--
--   `sqm_range` and `area_surcharge` already exist and are not altered here.
--   No booking amount is changed by running this.
--
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_note VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS priced_at  TIMESTAMP;

-- From v15, now unused. IF EXISTS makes this a no-op if v15 was never run.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_final_price_check;
ALTER TABLE bookings DROP COLUMN     IF EXISTS final_price;

-- Check: the two columns that remain, and how many bookings have been
-- inspected so far (0 right after running this).
SELECT COUNT(*) AS bookings,
       COUNT(priced_at) AS size_checked_after_inspection
FROM bookings;
