USE zclean_db;

CREATE TABLE IF NOT EXISTS client_notifications (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT          NOT NULL,
  booking_id INT          NULL,
  type       VARCHAR(50)  NOT NULL,
  title      VARCHAR(150) NOT NULL,
  message    TEXT         NOT NULL,
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_notifs ON client_notifications(user_id, is_read);
