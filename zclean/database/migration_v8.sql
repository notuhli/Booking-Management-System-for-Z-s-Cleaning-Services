-- migration_v8.sql — Cleanup: drop unused per-service addon tables
-- The per-service addon system (service_addons / booking_addons, introduced in
-- migration_v2) was superseded by the global addons system (global_addons /
-- booking_global_addons). Its controller and routes were never mounted and
-- have been removed from the codebase. These tables hold no live data paths.
--
-- Drop order matters: booking_addons has an FK to service_addons.

DROP TABLE IF EXISTS booking_addons;
DROP TABLE IF EXISTS service_addons;
