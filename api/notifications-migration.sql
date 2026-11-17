-- In-app notifications bell (parity with backend/src/db/schema.pg.sql)
CREATE TABLE IF NOT EXISTS app_notifications (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  category   VARCHAR(50)  NOT NULL DEFAULT 'activity',
  title      VARCHAR(180) NOT NULL,
  body       VARCHAR(500) NOT NULL DEFAULT '',
  url        VARCHAR(500) NOT NULL DEFAULT '/',
  read_at    TIMESTAMP    NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_app_notifications_user_created (user_id, created_at),
  INDEX idx_app_notifications_user_unread (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
