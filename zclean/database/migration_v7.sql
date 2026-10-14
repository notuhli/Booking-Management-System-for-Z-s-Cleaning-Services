-- ZClean Migration v7 — Reschedule Requests
-- Run in phpMyAdmin → zclean_db → SQL tab

USE zclean_db;

ALTER TABLE bookings
  ADD COLUMN reschedule_date     DATE    NULL AFTER notes,
  ADD COLUMN reschedule_time     TIME    NULL AFTER reschedule_date,
  ADD COLUMN reschedule_status   ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' AFTER reschedule_time;
