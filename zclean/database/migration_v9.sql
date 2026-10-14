-- migration_v9.sql — Admin dashboard notes
-- Personal scratchpad for the admin: short notes they can add, edit, and
-- delete from the dashboard (e.g., "buy more supplies", "call client re: gate").

CREATE TABLE IF NOT EXISTS admin_notes (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
