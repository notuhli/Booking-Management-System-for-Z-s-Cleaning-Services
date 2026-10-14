-- ============================================================================
-- ZClean — Supabase (PostgreSQL) Schema
-- Paste this ENTIRE file into Supabase → SQL Editor → Run.
--
-- Consolidates schema.sql + migrations v1–v9, translated from MySQL/MariaDB,
-- with column shapes taken from what the CODE actually reads/writes (the
-- migration files contained conflicting versions of some tables).
-- Notes on translation choices:
--   • AUTO_INCREMENT            → GENERATED ALWAYS AS IDENTITY
--   • ENUM(...)                 → VARCHAR + CHECK (easier to evolve in PG)
--   • ON UPDATE CURRENT_TIMESTAMP → trigger (set_updated_at)
--   • TIMESTAMP                 → TIMESTAMPTZ (stored in UTC, rendered per tz)
-- ============================================================================

-- ── Trigger helper: keep updated_at fresh (replaces MySQL ON UPDATE) ──
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users ──
CREATE TABLE IF NOT EXISTS users (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(100) NOT NULL UNIQUE,
  phone      VARCHAR(20),
  address    TEXT,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(10) NOT NULL DEFAULT 'client' CHECK (role IN ('admin','client')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── services ──
CREATE TABLE IF NOT EXISTS services (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  details      TEXT,
  price        DECIMAL(10,2) NOT NULL,
  duration_hrs INT NOT NULL DEFAULT 3,
  image_url    VARCHAR(255),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── global_addons ──
CREATE TABLE IF NOT EXISTS global_addons (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── bookings ──
-- status list = every value the application writes or filters on
CREATE TABLE IF NOT EXISTS bookings (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id      INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  service_id     INT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  time_start     TIME NOT NULL,
  time_end       TIME NOT NULL,
  location       TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','done','completed','cancelled','pending_reschedule')),
  notes          TEXT,
  payment_method VARCHAR(10) NOT NULL DEFAULT 'cash'
                 CHECK (payment_method IN ('cash','gcash')),
  payment_status VARCHAR(25) NOT NULL DEFAULT 'unpaid'
                 CHECK (payment_status IN ('unpaid','pending_verification','paid')),
  gcash_receipt  VARCHAR(255),
  sqm_range      VARCHAR(50)   DEFAULT NULL,
  area_surcharge DECIMAL(10,2) DEFAULT 0,
  transport_fee  DECIMAL(10,2) DEFAULT 0,
  proposed_date  DATE          DEFAULT NULL,
  proposed_time  TIME          DEFAULT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── booking_global_addons ──
CREATE TABLE IF NOT EXISTS booking_global_addons (
  booking_id INT NOT NULL REFERENCES bookings(id)      ON DELETE CASCADE,
  addon_id   INT NOT NULL REFERENCES global_addons(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, addon_id)
);

-- ── payments ──
CREATE TABLE IF NOT EXISTS payments (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount     DECIMAL(10,2) NOT NULL,
  method     VARCHAR(50) NOT NULL DEFAULT 'Cash',
  paid_at    TIMESTAMPTZ DEFAULT now()
);

-- ── expenses ──
CREATE TABLE IF NOT EXISTS expenses (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category     VARCHAR(100) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  description  TEXT,
  expense_date DATE NOT NULL,
  recorded_by  INT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── reviews ── (code uses `reply`; the old admin_reply shape is obsolete)
CREATE TABLE IF NOT EXISTS reviews (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id INT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  client_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  reply      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── blocked_dates ──
CREATE TABLE IF NOT EXISTS blocked_dates (
  id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date    DATE NOT NULL UNIQUE,
  reason  VARCHAR(255),
  blocked BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── settings ──
CREATE TABLE IF NOT EXISTS settings (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key   VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT
);

-- ── client_notifications ── (code writes user_id, booking_id, message, type)
CREATE TABLE IF NOT EXISTS client_notifications (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INT REFERENCES bookings(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  type       VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_notifs ON client_notifications(user_id, is_read);

-- ── password_reset_tokens ── (code uses the 6-digit `otp` shape)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp        VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── messages ──
CREATE TABLE IF NOT EXISTS messages (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id  INT REFERENCES bookings(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── admin_notes ── (migration_v9)
CREATE TABLE IF NOT EXISTS admin_notes (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_admin_notes_updated ON admin_notes;
CREATE TRIGGER trg_admin_notes_updated
  BEFORE UPDATE ON admin_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Seed data (id sequences respected via OVERRIDING SYSTEM VALUE)
-- ============================================================================

-- Admin (password: admin123)
INSERT INTO users (id, name, email, phone, role, password)
OVERRIDING SYSTEM VALUE VALUES
(1, 'ZClean Admin', 'admin@zclean.com', '0916-213-3460', 'admin',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHC')
ON CONFLICT (email) DO NOTHING;

INSERT INTO services (id, name, description, price, duration_hrs)
OVERRIDING SYSTEM VALUE VALUES
(1, 'Standard Clean', 'Basic cleaning: sweeping, mopping, wiping surfaces, bathroom sanitation.',     1199.00, 3),
(2, 'Platinum Clean', 'Full standard plus cabinet wipe-down, window cleaning, and appliance wipe.',   1499.00, 5),
(3, 'Deep Cleaning',  'Full deep clean: walls, tile scrubbing, behind appliances, full disinfection.', 1800.00, 8)
ON CONFLICT DO NOTHING;

INSERT INTO global_addons (id, name, price)
OVERRIDING SYSTEM VALUE VALUES
(1, 'Laundry – Regular Clothes',   200.00),
(2, 'Laundry – Beddings',          200.00),
(3, 'Laundry – Towels',            200.00),
(4, 'Laundry – Premium (2 loads)', 400.00),
(5, 'Aircon Cleaning – Split',     899.00),
(6, 'Aircon Cleaning – Window',    599.00)
ON CONFLICT DO NOTHING;

INSERT INTO settings (setting_key, setting_value) VALUES
('gcash_name',   'Z''s Cleaning Services'),
('gcash_number', '0916-213-3460'),
('gcash_qr_url', '')
ON CONFLICT (setting_key) DO NOTHING;

-- Re-sync identity sequences past the seeded ids
SELECT setval(pg_get_serial_sequence('users','id'),         GREATEST((SELECT MAX(id) FROM users), 1));
SELECT setval(pg_get_serial_sequence('services','id'),      GREATEST((SELECT MAX(id) FROM services), 1));
SELECT setval(pg_get_serial_sequence('global_addons','id'), GREATEST((SELECT MAX(id) FROM global_addons), 1));
