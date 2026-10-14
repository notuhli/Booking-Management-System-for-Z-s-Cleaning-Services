-- ============================================================================
-- audit_payment_amounts.sql — find payments recorded before the total fix
--
-- Until now, the admin's "Total" (and therefore the amount written to the
-- payments table) was computed as service + add-ons only, silently omitting
-- the area surcharge and transport fee the client was actually charged.
-- Any booking with either fee had its payment under-recorded, which
-- understates revenue in the monthly and yearly reports.
--
-- STEP 1 — Review. Run this to list affected payments and the shortfall.
--          Read-only; changes nothing.
-- ============================================================================

SELECT
  b.id                                   AS booking_id,
  u.name                                 AS client_name,
  b.date,
  s.name                                 AS service_name,
  s.price                                AS service_price,
  COALESCE(ga.addons_total, 0)           AS addons_total,
  COALESCE(b.area_surcharge, 0)          AS area_surcharge,
  COALESCE(b.transport_fee, 0)           AS transport_fee,
  s.price + COALESCE(ga.addons_total, 0)
          + COALESCE(b.area_surcharge, 0)
          + COALESCE(b.transport_fee, 0) AS correct_total,
  p.amount                               AS recorded_amount,
  (s.price + COALESCE(ga.addons_total, 0)
           + COALESCE(b.area_surcharge, 0)
           + COALESCE(b.transport_fee, 0)) - p.amount AS shortfall
FROM payments p
JOIN bookings b ON b.id = p.booking_id
JOIN users    u ON u.id = b.client_id
JOIN services s ON s.id = b.service_id
LEFT JOIN (
  SELECT bga.booking_id, SUM(g.price) AS addons_total
  FROM booking_global_addons bga
  JOIN global_addons g ON g.id = bga.addon_id
  GROUP BY bga.booking_id
) ga ON ga.booking_id = b.id
WHERE p.amount <> (
        s.price + COALESCE(ga.addons_total, 0)
                + COALESCE(b.area_surcharge, 0)
                + COALESCE(b.transport_fee, 0))
ORDER BY b.date DESC;

-- ============================================================================
-- STEP 2 — Correct (OPTIONAL). Only run this if you want historic revenue to
--          reflect what clients were actually charged. Review Step 1 first.
--
--          Leaving history untouched is also defensible: the payments table
--          then records what was entered at the time. Decide deliberately.
-- ============================================================================

-- UPDATE payments p
-- SET amount = sub.correct_total
-- FROM (
--   SELECT b.id AS booking_id,
--          s.price + COALESCE(ga.addons_total, 0)
--                  + COALESCE(b.area_surcharge, 0)
--                  + COALESCE(b.transport_fee, 0) AS correct_total
--   FROM bookings b
--   JOIN services s ON s.id = b.service_id
--   LEFT JOIN (
--     SELECT bga.booking_id, SUM(g.price) AS addons_total
--     FROM booking_global_addons bga
--     JOIN global_addons g ON g.id = bga.addon_id
--     GROUP BY bga.booking_id
--   ) ga ON ga.booking_id = b.id
-- ) sub
-- WHERE p.booking_id = sub.booking_id
--   AND p.amount <> sub.correct_total;
