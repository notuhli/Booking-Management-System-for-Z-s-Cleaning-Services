USE zclean_db;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  user_id    INT          NOT NULL,
  token      VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  used       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
