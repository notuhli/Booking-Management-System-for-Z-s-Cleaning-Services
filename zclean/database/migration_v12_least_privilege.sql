-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v12: least-privilege database role + Row Level Security
-- Security plan Phase 3 (findings M5 and L1).
--
-- WHAT THIS DOES
--   1. Creates `zclean_app`, a login role that can only read and write rows in
--      the application tables. It cannot DROP, ALTER, TRUNCATE or create
--      tables, and it cannot create other roles.
--   2. Turns on Row Level Security for every table in `public`, with one
--      policy per table that lets `zclean_app` through. Supabase's public
--      REST API (the `anon` / `authenticated` roles) gets NO policy, so it
--      can read nothing.
--   3. Removes the default Supabase grants that let `anon` / `authenticated`
--      touch these tables at all.
--
-- WHAT IT DOES NOT CHANGE
--   No table, column, row or constraint is modified. The `postgres` account
--   keeps full access, so the Supabase dashboard and SQL editor work exactly
--   as before, and future migrations are still run as `postgres`.
--
-- HOW TO RUN
--   1. Replace CHANGE_ME below with the password you were given.
--   2. Supabase → SQL Editor → paste this whole file → Run.
--   3. The last statement prints a check table — every row should show
--      rls_enabled = true and app_policy = true.
--   Safe to run more than once.
--
-- ROLLBACK
--   Put the old DATABASE_URL (user `postgres.<ref>`) back in server/.env and
--   restart the server. Nothing in this file needs undoing for that to work.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. The application role ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zclean_app') THEN
    CREATE ROLE zclean_app LOGIN PASSWORD '126757ff3c3dc27cbd5e8d76bb3b5e048f24019a155792ae'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE zclean_app LOGIN PASSWORD '126757ff3c3dc27cbd5e8d76bb3b5e048f24019a155792ae';
  END IF;
END $$;

-- Connections should start in Philippine time, same as the server sets.
ALTER ROLE zclean_app SET timezone = 'Asia/Manila';


-- ── 2. Exactly the privileges the app uses ──────────────────────────────────
-- Checked against the server code: every query is SELECT / INSERT / UPDATE /
-- DELETE. The server never creates, alters or drops anything at runtime.
GRANT USAGE ON SCHEMA public TO zclean_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO zclean_app;
GRANT USAGE, SELECT                   ON ALL SEQUENCES IN SCHEMA public TO zclean_app;

-- Tables added by FUTURE migrations (run as postgres) get the same grants
-- automatically, so a new feature doesn't fail with "permission denied".
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO zclean_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT                   ON SEQUENCES TO zclean_app;


-- ── 3. Close Supabase's public REST API to these tables ─────────────────────
-- ZClean's browser never talks to Supabase directly — every request goes
-- through the Express API. These roles therefore need nothing.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;


-- ── 4. Row Level Security on every table ────────────────────────────────────
-- Loops over whatever tables actually exist, so no table is missed even if
-- the live database has one the schema file doesn't mention.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS zclean_app_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY zclean_app_all ON public.%I FOR ALL TO zclean_app USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;


-- ── 5. Verification ─────────────────────────────────────────────────────────
-- One row per table. Every row should read: true | true | (a number ≥ 1 for
-- any table that has foreign keys or checks).
SELECT
  c.relname                                                   AS table_name,
  c.relrowsecurity                                            AS rls_enabled,
  EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
            AND p.policyname = 'zclean_app_all')              AS app_policy,
  (SELECT count(*) FROM pg_constraint k
    WHERE k.conrelid = c.oid AND k.contype = 'f')             AS foreign_keys,
  (SELECT count(*) FROM pg_constraint k
    WHERE k.conrelid = c.oid AND k.contype = 'c')             AS check_constraints
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
