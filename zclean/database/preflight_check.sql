-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — pre-deployment database check
--
-- Run this in Supabase → SQL Editor BEFORE deploying. It changes nothing.
-- Every row must say OK. Anything saying MISSING means a migration was never
-- run against this database, and the feature that needs it will fail in
-- production with a 500 error.
-- ════════════════════════════════════════════════════════════════════════════

WITH checks AS (
  SELECT 'users.is_active (deactivate a client)' AS needs,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='users' AND column_name='is_active') AS ok
  UNION ALL SELECT 'messages.image_url (photos in chat)',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='messages' AND column_name='image_url')
  UNION ALL SELECT 'bookings.price_note + priced_at (migration v16)',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='price_note')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='priced_at')
  UNION ALL SELECT 'transport_fees table (migration v13)',
         EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name='transport_fees')
  UNION ALL SELECT 'payment_status allows ''partial'' (migration v14)',
         EXISTS (SELECT 1 FROM information_schema.check_constraints
                  WHERE constraint_name='bookings_payment_status_check'
                    AND check_clause LIKE '%partial%')
  UNION ALL SELECT 'reservation_fee setting (migration v14)',
         EXISTS (SELECT 1 FROM settings WHERE setting_key='reservation_fee')
  UNION ALL SELECT 'bookings.sqm_range + area_surcharge + transport_fee',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='sqm_range')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='area_surcharge')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='transport_fee')
  UNION ALL SELECT 'bookings.final_price removed (migration v16)',
         NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='bookings' AND column_name='final_price')
)
SELECT CASE WHEN ok THEN '✅ OK' ELSE '❌ MISSING — run the migration' END AS result, needs
FROM checks ORDER BY ok, needs;
