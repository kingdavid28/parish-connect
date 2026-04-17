-- Parish Connect Database Schema
-- Compatible with MySQL 5.7+ and 8.0+
-- Safe to run multiple times — all statements are idempotent.
-- Run this inside your Hostinger database via phpMyAdmin.

-- ─────────────────────────────────────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('superadmin','admin','parishioner') NOT NULL DEFAULT 'parishioner',
  parish_id     VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  avatar        VARCHAR(500) NULL,
  baptism_date  DATE         NULL,
  member_since  DATE         NULL,
  created_by    VARCHAR(36)  NULL,
  last_login    DATETIME     NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id        VARCHAR(36)  NOT NULL,
  content        TEXT         NOT NULL,
  type           ENUM('community','baptism_anniversary','parish_event','research') NOT NULL DEFAULT 'community',
  image_url      VARCHAR(500) NULL,
  event_date     VARCHAR(100) NULL,
  event_location VARCHAR(255) NULL,
  baptism_year   INT          NULL,
  is_pinned      TINYINT(1)   DEFAULT 0,
  is_approved    TINYINT(1)   DEFAULT 1,
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_user_id   (user_id),
  INDEX idx_posts_created_at(created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  post_id    VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  content    TEXT        NOT NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comments_post_id(post_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS baptism_records (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  full_name     VARCHAR(200) NOT NULL,
  baptism_date  DATE         NOT NULL,
  birth_date    DATE         NOT NULL,
  father_name   VARCHAR(200) NOT NULL,
  mother_name   VARCHAR(200) NOT NULL,
  godfather_name VARCHAR(200) NOT NULL,
  godmother_name VARCHAR(200) NULL,
  priest        VARCHAR(200) NOT NULL,
  location      VARCHAR(255) NOT NULL DEFAULT 'St. Mary''s Catholic Church',
  record_number VARCHAR(50)  NOT NULL UNIQUE,
  parish_id     VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  verified      TINYINT(1)   DEFAULT 0,
  notes         TEXT         NULL,
  created_by    VARCHAR(36)  NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_baptism_records_full_name   (full_name),
  INDEX idx_baptism_records_baptism_date(baptism_date),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  NULL,
  target_id   VARCHAR(36)  NULL,
  details     JSON         NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_user_id   (user_id),
  INDEX idx_audit_logs_created_at(created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  VARCHAR(36) NOT NULL,
  following_id VARCHAR(36) NOT NULL,
  created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  INDEX idx_follows_follower (follower_id),
  INDEX idx_follows_following(following_id),
  FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  sender_id   VARCHAR(36)  NOT NULL,
  receiver_id VARCHAR(36)  NOT NULL,
  content     TEXT         NOT NULL DEFAULT '',
  image_url   VARCHAR(500) NULL,
  is_read     TINYINT(1)   DEFAULT 0,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_sender      (sender_id),
  INDEX idx_messages_receiver    (receiver_id),
  INDEX idx_messages_conversation(sender_id, receiver_id),
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL,
  endpoint   VARCHAR(500) NOT NULL,
  p256dh     VARCHAR(255) NOT NULL,
  auth       VARCHAR(100) NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_endpoint(user_id, endpoint(255)),
  INDEX idx_push_subscriptions_user(user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Group chats
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_chats (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  avatar     VARCHAR(500) NULL,
  created_by VARCHAR(36)  NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  VARCHAR(36) NOT NULL,
  user_id   VARCHAR(36) NOT NULL,
  role      ENUM('admin','member') NOT NULL DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_group_members_group(group_id),
  INDEX idx_group_members_user (user_id),
  FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_messages (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  group_id   VARCHAR(36)  NOT NULL,
  sender_id  VARCHAR(36)  NOT NULL,
  content    TEXT         NOT NULL DEFAULT '',
  image_url  VARCHAR(500) NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_group_messages_group(group_id),
  INDEX idx_group_messages_time (group_id, created_at),
  FOREIGN KEY (group_id)  REFERENCES group_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)       ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards & wallet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_points (
  user_id      VARCHAR(36) NOT NULL PRIMARY KEY,
  total_points INT         NOT NULL DEFAULT 0,
  updated_at   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  action     VARCHAR(50) NOT NULL,
  points     INT         NOT NULL,
  ref_id     VARCHAR(36) NULL,
  created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pt_user      (user_id),
  INDEX idx_pt_action    (action),
  INDEX idx_pt_created_at(created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_badges (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  badge_slug VARCHAR(50) NOT NULL,
  earned_at  DATETIME    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_badge(user_id, badge_slug),
  INDEX idx_ub_user(user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gbless_topup_requests (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)   NOT NULL,
  gcash_ref     VARCHAR(100)  NOT NULL,
  gcash_sender  VARCHAR(100)  NOT NULL,
  amount_php    DECIMAL(10,2) NOT NULL,
  gbless_amount BIGINT        NOT NULL,
  receipt_url   VARCHAR(500)  NULL,
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note    TEXT          NULL,
  reviewed_by   VARCHAR(36)   NULL,
  reviewed_at   DATETIME      NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_topup_user  (user_id),
  INDEX idx_topup_status(status),
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS gbless_cashout_requests (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)   NOT NULL,
  gbless_amount BIGINT        NOT NULL,
  amount_php    DECIMAL(10,2) NOT NULL,
  gcash_number  VARCHAR(20)   NOT NULL,
  gcash_name    VARCHAR(100)  NOT NULL,
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note    TEXT          NULL,
  reviewed_by   VARCHAR(36)   NULL,
  reviewed_at   DATETIME      NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cashout_user  (user_id),
  INDEX idx_cashout_status(status),
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS gbless_gifts (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  sender_id     VARCHAR(36)  NOT NULL,
  receiver_id   VARCHAR(36)  NOT NULL,
  gbless_amount BIGINT       NOT NULL,
  message       VARCHAR(255) NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gifts_sender  (sender_id),
  INDEX idx_gifts_receiver(receiver_id),
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Family groups & ministries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_groups (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT         NULL,
  created_by  VARCHAR(36)  NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_group_members (
  group_id     VARCHAR(36) NOT NULL,
  user_id      VARCHAR(36) NOT NULL,
  relationship ENUM('parent','child','spouse','sibling','grandparent','grandchild','relative','other') NOT NULL DEFAULT 'other',
  joined_at    DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_fgm_group(group_id),
  INDEX idx_fgm_user (user_id),
  FOREIGN KEY (group_id) REFERENCES family_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)         ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ministries (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   TEXT         NULL,
  schedule      VARCHAR(255) NULL,
  contact_name  VARCHAR(100) NULL,
  contact_email VARCHAR(255) NULL,
  created_by    VARCHAR(36)  NOT NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ministry_members (
  ministry_id VARCHAR(36) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  joined_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ministry_id, user_id),
  INDEX idx_mm_ministry(ministry_id),
  INDEX idx_mm_user    (user_id),
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Super Admin account
-- Password: Admin@1234  (change after first login)
-- Re-hash at https://bcrypt-generator.com (12 rounds)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO users (id, name, email, password_hash, role, parish_id, member_since)
VALUES (
  'super-admin-001',
  'Super Administrator',
  'admin@yourparish.com',
  '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'superadmin',
  'st-marys',
  CURDATE()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Safe ALTER statements for existing deployments
-- These add columns/tables that may be missing on older installs.
-- Safe to run even if the column already exists (MySQL 8.0+).
-- On MySQL 5.7, skip these if you get "Duplicate column" errors — it just
-- means the column is already there.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER content;
ALTER TABLE posts    ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER type;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS purchased_points BIGINT NOT NULL DEFAULT 0;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS gifted_points    BIGINT NOT NULL DEFAULT 0;
