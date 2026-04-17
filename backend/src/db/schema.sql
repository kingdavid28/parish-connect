-- Parish Connect Database Schema
-- Compatible with MySQL 5.7+ and 8.0+
-- Run this inside your Hostinger database (already selected in phpMyAdmin)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('superadmin', 'admin', 'parishioner') NOT NULL DEFAULT 'parishioner',
  parish_id VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  avatar VARCHAR(500),
  baptism_date DATE,
  member_since DATE,
  created_by VARCHAR(36),
  last_login DATETIME,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  type ENUM('community', 'baptism_anniversary', 'parish_event', 'research') NOT NULL DEFAULT 'community',
  image_url VARCHAR(500) NULL,
  event_date VARCHAR(100),
  event_location VARCHAR(255),
  baptism_year INT,
  is_pinned TINYINT(1) DEFAULT 0,
  is_approved TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Post likes table
CREATE TABLE IF NOT EXISTS post_likes (
  post_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(36) PRIMARY KEY,
  post_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Baptism records table
CREATE TABLE IF NOT EXISTS baptism_records (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  baptism_date DATE NOT NULL,
  birth_date DATE NOT NULL,
  father_name VARCHAR(200) NOT NULL,
  mother_name VARCHAR(200) NOT NULL,
  godfather_name VARCHAR(200) NOT NULL,
  godmother_name VARCHAR(200),
  priest VARCHAR(200) NOT NULL,
  location VARCHAR(255) NOT NULL DEFAULT 'St. Mary''s Catholic Church',
  record_number VARCHAR(50) NOT NULL UNIQUE,
  parish_id VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  verified TINYINT(1) DEFAULT 0,
  notes TEXT,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(36),
  details JSON,
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_baptism_records_full_name ON baptism_records(full_name);
CREATE INDEX idx_baptism_records_baptism_date ON baptism_records(baptism_date);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Super Admin account
-- Password below is bcrypt hash of: Admin@1234
-- CHANGE THE PASSWORD after first login via the app or re-hash a new one at:
-- https://bcrypt-generator.com  (use 12 rounds)
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

-- Follows table
CREATE TABLE IF NOT EXISTS follows (
  follower_id VARCHAR(36) NOT NULL,
  following_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY,
  sender_id VARCHAR(36) NOT NULL,
  receiver_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url VARCHAR(500) NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id);

-- Push subscriptions table (Web Push / PWA notifications)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_endpoint (user_id, endpoint(255)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Group Chats
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
  group_id   VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  role       ENUM('admin','member') NOT NULL DEFAULT 'member',
  joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
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
  FOREIGN KEY (group_id)  REFERENCES group_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)       ON DELETE CASCADE
);

CREATE INDEX idx_group_members_group  ON group_members(group_id);
CREATE INDEX idx_group_members_user   ON group_members(user_id);
CREATE INDEX idx_group_messages_group ON group_messages(group_id);
CREATE INDEX idx_group_messages_time  ON group_messages(group_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER statements for existing deployments (safe to run on already-migrated DBs)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE messages  ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER content;
ALTER TABLE posts     ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NULL AFTER type;
