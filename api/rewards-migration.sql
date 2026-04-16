-- Rewards System Migration
-- Run this in your Hostinger phpMyAdmin (or via CLI)

-- Cumulative points per user
CREATE TABLE IF NOT EXISTS user_points (
  user_id      VARCHAR(36) NOT NULL PRIMARY KEY,
  total_points INT         NOT NULL DEFAULT 0,
  updated_at   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Full audit trail of every point event
CREATE TABLE IF NOT EXISTS point_transactions (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  action     VARCHAR(50)  NOT NULL,   -- post_created | comment_added | like_received | kudos_received | follow_received | daily_login
  points     INT          NOT NULL,
  ref_id     VARCHAR(36)  NULL,       -- post_id, giver_id, etc.
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pt_user       ON point_transactions(user_id);
CREATE INDEX idx_pt_action     ON point_transactions(action);
CREATE INDEX idx_pt_created_at ON point_transactions(created_at);

-- Badges earned by users
CREATE TABLE IF NOT EXISTS user_badges (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  badge_slug VARCHAR(50) NOT NULL,
  earned_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_badge (user_id, badge_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_ub_user ON user_badges(user_id);
