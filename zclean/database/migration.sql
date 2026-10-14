-- ZClean Migration — Run this in phpMyAdmin > zclean_db > SQL tab
-- Safe to run even if some tables already exist (uses IF NOT EXISTS)
-- Does NOT drop or modify existing data.

USE zclean_db;

-- Global add-ons (may be new)
CREATE TABLE IF NOT EXISTS global_addons (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for bookings <-> global add-ons
CREATE TABLE IF NOT EXISTS booking_global_addons (
  booking_id INT NOT NULL,
  addon_id   INT NOT NULL,
  PRIMARY KEY (booking_id, addon_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id)   REFERENCES global_addons(id) ON DELETE CASCADE
);

-- Client notifications
CREATE TABLE IF NOT EXISTS client_notifications (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  booking_id INT,
  message    TEXT NOT NULL,
  type       VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

-- OTP-based password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  otp        VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Blocked dates calendar
CREATE TABLE IF NOT EXISTS blocked_dates (
  id     INT PRIMARY KEY AUTO_INCREMENT,
  date   DATE NOT NULL UNIQUE,
  reason VARCHAR(255)
);

-- Settings (GCash QR, name, number)
CREATE TABLE IF NOT EXISTS settings (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  setting_key   VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL UNIQUE,
  client_id  INT NOT NULL,
  rating     TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  reply      TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id)  REFERENCES users(id)    ON DELETE CASCADE
);

-- Add missing columns to bookings if they don't exist yet
-- (safe — ALTER IGNORE or check manually if you get errors)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method ENUM('cash','gcash') NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_status ENUM('unpaid','pending_verification','paid') NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS gcash_receipt  VARCHAR(255);

-- Seed global add-ons (only if table is empty)
INSERT IGNORE INTO global_addons (id, name, price, is_active) VALUES
  (1, 'Laundry – Regular Clothes',   200.00, 1),
  (2, 'Laundry – Beddings',          200.00, 1),
  (3, 'Laundry – Towels',            200.00, 1),
  (4, 'Laundry – Premium (2 loads)', 400.00, 1),
  (5, 'Aircon Cleaning – Split',     899.00, 1),
  (6, 'Aircon Cleaning – Window',    599.00, 1);

-- Seed GCash settings
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
  ('gcash_name',   "Z's Cleaning Services"),
  ('gcash_number', '0916-213-3460'),
  ('gcash_qr_url', '');

SELECT 'Migration complete.' AS result;

-- Add 'completed' to bookings status ENUM (run if upgrading from previous version)
ALTER TABLE bookings MODIFY COLUMN status ENUM('pending','confirmed','done','completed') NOT NULL DEFAULT 'pending';

-- Fix password_reset_tokens table (old version had 'token' column, new needs 'otp')
-- Run this if you get "Unknown column 'otp' in field list" error
DROP TABLE IF EXISTS password_reset_tokens;
CREATE TABLE password_reset_tokens (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  otp        VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add reply column to reviews if it doesn't exist (fixes "Failed to save reply" error)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply TEXT;

-- Chat messages table
CREATE TABLE IF NOT EXISTS messages (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  sender_id   INT NOT NULL,
  receiver_id INT NOT NULL,
  booking_id  INT,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id)  REFERENCES bookings(id) ON DELETE SET NULL
);

-- Area surcharge columns on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sqm_range VARCHAR(50) DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS area_surcharge DECIMAL(10,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transport_fee DECIMAL(10,2) DEFAULT 0;

-- Settings for new fees (run even if already exists)
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
  ('transport_fee',      '500'),
  ('surcharge_100_200',  '500'),
  ('surcharge_200_plus', '1000');

-- Reschedule proposal columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_date DATE DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_time TIME DEFAULT NULL;

-- Add pending_reschedule to status ENUM
ALTER TABLE bookings MODIFY COLUMN status ENUM('pending','confirmed','done','completed','pending_reschedule') NOT NULL DEFAULT 'pending';

-- Add details column to services for admin-entered bullet points (one per line)
ALTER TABLE services ADD COLUMN IF NOT EXISTS details TEXT DEFAULT NULL;
