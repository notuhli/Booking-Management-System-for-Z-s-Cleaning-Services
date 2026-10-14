-- ZClean Migration v3 — Calendar blocked dates
-- Run in phpMyAdmin → zclean_db → SQL tab

USE zclean_db;

CREATE TABLE IF NOT EXISTS blocked_dates (
  id      INT PRIMARY KEY AUTO_INCREMENT,
  date    DATE        NOT NULL UNIQUE,
  reason  VARCHAR(255) NULL,
  blocked BOOLEAN     NOT NULL DEFAULT TRUE
);
