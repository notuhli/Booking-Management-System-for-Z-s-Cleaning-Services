-- ============================================================================
-- migration_v11_service_details.sql — make service bullet points editable
--
-- The bullet lists for the original three services were hardcoded in the
-- frontend (SERVICE_DETAILS in HomePage.jsx / BookingPage.jsx). The app now
-- prefers each service's own `details` column, falling back to those hardcoded
-- lists only while the column is empty.
--
-- This copies the current text into the database so the admin opens the
-- "Bullet Points" field and sees the live content ready to edit, instead of an
-- empty box. One bullet per line — the first line is the "Includes everything
-- in ..." lead-in for Platinum and Deep Cleaning.
--
-- Only fills services whose details are still empty, so it will not overwrite
-- anything the admin has already written. Safe to run more than once.
-- ============================================================================

UPDATE services
SET details =
'Sweeping & mopping of all floors
Dusting of furniture & surfaces
Wiping of tables, counters, appliances (outer surface only)
Bathroom cleaning (toilet, sink, floor, mirror)
Kitchen cleaning (sink, counters, stovetop)
General trash disposal
Basic disinfection of high-touch areas'
WHERE name = 'Standard Clean'
  AND (details IS NULL OR TRIM(details) = '');

UPDATE services
SET details =
'Includes everything in Standard, plus:
Deep scrubbing of bathroom tiles & grout
Interior window cleaning (glass, sills, frames)
Detailed dusting (corners, baseboards, ceiling edges)
Vacuuming of sofas, carpets & curtains (if any)
Appliance surface detail (fridge, microwave, oven outside)
Extra disinfection (bathroom & kitchen focus)'
WHERE name = 'Platinum Clean'
  AND (details IS NULL OR TRIM(details) = '');

UPDATE services
SET details =
'Includes everything in Platinum, plus:
Complete kitchen deep clean (fridge, oven, cabinets outside)
Heavy scrubbing of floors (stains, corners, hard-to-reach areas)
Mattress vacuuming & dust mite treatment
Furniture moving for full-area clean (where possible)
Comprehensive bathroom sanitation (shower, hard water stains, molds)
Full disinfection of all rooms'
WHERE name = 'Deep Cleaning'
  AND (details IS NULL OR TRIM(details) = '');

-- Verify:
-- SELECT name, details FROM services ORDER BY id;
