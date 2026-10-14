-- ════════════════════════════════════════════════════════════════════════════
-- ZClean — migration v13: per-barangay transportation fees
--
-- WHY
--   The transport fee was one flat amount, and the list of barangays it applied
--   to was hardcoded in the website's code (client/src/utils/addressData.js),
--   so the admin could not change either one. This table moves both into the
--   database: one default per municipality, plus an override for any barangay
--   that costs more or less — including ₱0.
--
-- HOW A FEE IS RESOLVED
--   1. an override row for that exact barangay, if one exists;
--   2. otherwise the municipality's default row (barangay = '');
--   3. otherwise ₱0.
--
-- THE SEED BELOW REPRODUCES TODAY'S BEHAVIOUR EXACTLY
--   Calbayog City default ₱0, with ₱500 on the 23 barangays that were in the
--   hardcoded "outside proper" list; the other three municipalities ₱500. So
--   nothing changes in pricing until the admin edits a value.
--   If your flat fee was not ₱500, change the three 500s in the seed.
--
-- Safe to run more than once — it only inserts rows that are missing.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transport_fees (
  id           SERIAL PRIMARY KEY,
  municipality VARCHAR(100)  NOT NULL,
  -- '' (empty string) means "the default for this whole municipality".
  -- Empty string rather than NULL so the UNIQUE constraint below actually
  -- prevents duplicates — in SQL, NULL is never equal to another NULL.
  barangay     VARCHAR(100)  NOT NULL DEFAULT '',
  fee          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  updated_at   TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (municipality, barangay)
);

-- Municipality defaults
INSERT INTO transport_fees (municipality, barangay, fee) VALUES
  ('Calbayog City',   '',   0),
  ('Gandara',         '', 500),
  ('Sta. Margarita',  '', 500),
  ('San Jorge',       '', 500)
ON CONFLICT (municipality, barangay) DO NOTHING;

-- The 23 Calbayog barangays that were charged under the old hardcoded list
INSERT INTO transport_fees (municipality, barangay, fee)
SELECT 'Calbayog City', b, 500
FROM (VALUES
  ('Tinambacan Norte'),('Tinambacan Sur'),
  ('Limaong'),('Longsob'),('Lonoy'),('Hamorawon'),('Carayman'),
  ('Tapa-e'),('Tigbao'),('Tabawan'),('Talahid'),('Talamban'),
  ('Pinamihagan'),('Saputan'),('Tolingon'),('Tumalalod'),('Ubo'),
  ('Malajog'),('Cagboborac'),('Cag-olango'),
  ('Monbon'),('Mancol'),('Lale'),('Kilikili')
) AS t(b)
ON CONFLICT (municipality, barangay) DO NOTHING;

-- Grant the Phase 3 application role access to the new table. Harmless if that
-- role does not exist yet (this whole block is skipped in that case).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zclean_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON transport_fees TO zclean_app;
    GRANT USAGE, SELECT ON SEQUENCE transport_fees_id_seq TO zclean_app;
    ALTER TABLE transport_fees ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS zclean_app_all ON transport_fees;
    CREATE POLICY zclean_app_all ON transport_fees
      FOR ALL TO zclean_app USING (true) WITH CHECK (true);
    REVOKE ALL ON transport_fees FROM anon, authenticated;
  END IF;
END $$;

-- Check: municipality defaults, then overrides.
SELECT municipality,
       CASE WHEN barangay = '' THEN '(default for municipality)' ELSE barangay END AS applies_to,
       fee
FROM transport_fees
ORDER BY municipality, (barangay <> ''), barangay;
