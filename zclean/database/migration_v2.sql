-- ─────────────────────────────────────────
-- ZClean Migration — New Features
-- Run this in phpMyAdmin → SQL tab
-- ─────────────────────────────────────────

USE zclean_db;

-- 1. Add address to users
ALTER TABLE users
  ADD COLUMN address TEXT NULL AFTER phone;

-- 2. Add image_url to services
ALTER TABLE services
  ADD COLUMN image_url VARCHAR(255) NULL AFTER is_active;

-- 3. Add payment_method and gcash_receipt to bookings
ALTER TABLE bookings
  ADD COLUMN payment_method ENUM('cash', 'gcash') NOT NULL DEFAULT 'cash' AFTER notes,
  ADD COLUMN gcash_receipt  VARCHAR(255) NULL AFTER payment_method,
  ADD COLUMN payment_status ENUM('unpaid', 'paid', 'pending_verification') NOT NULL DEFAULT 'unpaid' AFTER gcash_receipt;

-- 4. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  client_id   INT           NOT NULL,
  booking_id  INT           NOT NULL UNIQUE,
  rating      TINYINT       NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  admin_reply TEXT          NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  replied_at  TIMESTAMP NULL,

  FOREIGN KEY (client_id)  REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)  ON DELETE CASCADE
);

-- 5. Service add-ons table
CREATE TABLE IF NOT EXISTS service_addons (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  service_id  INT            NOT NULL,
  name        VARCHAR(100)   NOT NULL,
  price       DECIMAL(10,2)  NOT NULL DEFAULT 0,
  is_active   BOOLEAN        NOT NULL DEFAULT TRUE,

  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- 6. Settings table (for GCash QR and other admin settings)
CREATE TABLE IF NOT EXISTS settings (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  key_name    VARCHAR(100)   NOT NULL UNIQUE,
  value       TEXT           NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO settings (key_name, value) VALUES
  ('gcash_qr_url',   NULL),
  ('gcash_name',     'Z Cleaning Services'),
  ('gcash_number',   '09XX XXX XXXX');

-- 7. Booking add-ons junction table
CREATE TABLE IF NOT EXISTS booking_addons (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL,
  addon_id   INT NOT NULL,

  FOREIGN KEY (booking_id) REFERENCES bookings(id)       ON DELETE CASCADE,
  FOREIGN KEY (addon_id)   REFERENCES service_addons(id) ON DELETE CASCADE
);
