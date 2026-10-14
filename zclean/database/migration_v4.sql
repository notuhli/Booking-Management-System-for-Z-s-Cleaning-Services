USE zclean_db;

CREATE TABLE IF NOT EXISTS global_addons (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  name      VARCHAR(150)   NOT NULL,
  price     DECIMAL(10,2)  NOT NULL DEFAULT 0,
  is_active BOOLEAN        NOT NULL DEFAULT TRUE
);

INSERT INTO global_addons (name, price, is_active) VALUES
  ('Laundry - Clothes (10kg)', 200.00, 1),
  ('Laundry - Beddings (1 set)', 200.00, 1),
  ('Laundry - Towels (up to 8 pcs)', 200.00, 1),
  ('Laundry Premium - 2 loads (20kg / 2 sets beddings)', 400.00, 1),
  ('Aircon Cleaning - Split Type', 899.00, 1),
  ('Aircon Cleaning - Window Type', 599.00, 1);

CREATE TABLE IF NOT EXISTS booking_global_addons (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL,
  addon_id   INT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id)   REFERENCES global_addons(id) ON DELETE CASCADE
);
