CREATE TABLE IF NOT EXISTS app_notifications (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   VARCHAR(50)  NOT NULL DEFAULT 'activity',
  title      VARCHAR(180) NOT NULL,
  body       VARCHAR(500) NOT NULL DEFAULT '',
  url        VARCHAR(500) NOT NULL DEFAULT '/',
  read_at    TIMESTAMP    NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_created
  ON app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread
  ON app_notifications(user_id, read_at);
