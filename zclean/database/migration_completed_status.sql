-- Run this in phpMyAdmin > zclean_db > SQL tab
-- Adds 'completed' as a valid booking status (alongside 'done')
USE zclean_db;
ALTER TABLE bookings MODIFY COLUMN status ENUM('pending','confirmed','done','completed','cancelled') NOT NULL DEFAULT 'pending';
SELECT 'Migration done — completed status added.' AS result;
