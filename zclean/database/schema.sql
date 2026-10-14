-- ZClean Database Schema — Run entire file in phpMyAdmin > SQL tab
CREATE DATABASE IF NOT EXISTS zclean_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zclean_db;

CREATE TABLE IF NOT EXISTS users (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(100) NOT NULL UNIQUE,
  phone      VARCHAR(20),
  address    TEXT,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('admin','client') NOT NULL DEFAULT 'client',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  details      TEXT,
  price        DECIMAL(10,2) NOT NULL,
  duration_hrs INT NOT NULL DEFAULT 3,
  image_url    VARCHAR(255),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_addons (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  client_id      INT NOT NULL,
  service_id     INT NOT NULL,
  date           DATE NOT NULL,
  time_start     TIME NOT NULL,
  time_end       TIME NOT NULL,
  location       TEXT NOT NULL,
  status         ENUM('pending','confirmed','done','completed') NOT NULL DEFAULT 'pending',
  notes          TEXT,
  payment_method ENUM('cash','gcash') NOT NULL DEFAULT 'cash',
  payment_status ENUM('unpaid','pending_verification','paid') NOT NULL DEFAULT 'unpaid',
  gcash_receipt  VARCHAR(255),
  sqm_range         VARCHAR(50)   DEFAULT NULL,
  area_surcharge    DECIMAL(10,2) DEFAULT 0,
  transport_fee     DECIMAL(10,2) DEFAULT 0,
  proposed_date     DATE          DEFAULT NULL,
  proposed_time     TIME          DEFAULT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id)  REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_global_addons (
  booking_id INT NOT NULL,
  addon_id   INT NOT NULL,
  PRIMARY KEY (booking_id, addon_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)      ON DELETE CASCADE,
  FOREIGN KEY (addon_id)   REFERENCES global_addons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  method     VARCHAR(50) NOT NULL DEFAULT 'Cash',
  paid_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  category     VARCHAR(100) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  description  TEXT,
  expense_date DATE NOT NULL,
  recorded_by  INT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS blocked_dates (
  id     INT PRIMARY KEY AUTO_INCREMENT,
  date   DATE NOT NULL UNIQUE,
  reason VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS settings (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  setting_key   VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT
);

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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT NOT NULL,
  otp        VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Seed Data ─────────────────────────────────────────────────────────────────

-- Admin (password: admin123)
INSERT IGNORE INTO users (id, name, email, phone, role, password) VALUES
(1, 'ZClean Admin', 'admin@zclean.com', '0916-213-3460', 'admin',
 '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHC');

-- Services
INSERT IGNORE INTO services (id, name, description, price, duration_hrs) VALUES
(1, 'Standard Clean',  'Basic cleaning: sweeping, mopping, wiping surfaces, bathroom sanitation.',          1199.00, 3),
(2, 'Platinum Clean',  'Full standard plus cabinet wipe-down, window cleaning, and appliance wipe.',        1499.00, 5),
(3, 'Deep Cleaning',   'Full deep clean: walls, tile scrubbing, behind appliances, full disinfection.',      1800.00, 8);

-- Global Add-ons
INSERT IGNORE INTO global_addons (id, name, price) VALUES
(1, 'Laundry – Regular Clothes',   200.00),
(2, 'Laundry – Beddings',          200.00),
(3, 'Laundry – Towels',            200.00),
(4, 'Laundry – Premium (2 loads)', 400.00),
(5, 'Aircon Cleaning – Split',     899.00),
(6, 'Aircon Cleaning – Window',    599.00);

-- Settings
INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
('gcash_name',   "Z's Cleaning Services"),
('gcash_number', '0916-213-3460'),
('gcash_qr_url', '');

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
