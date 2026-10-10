-- Parish Connect Database Schema — PostgreSQL / CockroachDB edition
-- Idempotent: safe to run multiple times (all CREATE IF NOT EXISTS / ON CONFLICT).

-- ─────────────────────────────────────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'parishioner'
                CHECK (role IN ('superadmin','admin','parishioner')),
  parish_id     VARCHAR(100) NOT NULL DEFAULT 'parish',
  avatar        VARCHAR(500) NULL,
  baptism_date  DATE         NULL,
  member_since  DATE         NULL,
  created_by    VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  last_login    TIMESTAMP    NULL,
  is_active     SMALLINT     NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id        VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content        TEXT         NOT NULL,
  type           VARCHAR(30)  NOT NULL DEFAULT 'community'
                 CHECK (type IN ('community','baptism_anniversary','parish_event','research')),
  image_url      VARCHAR(500) NULL,
  event_date     VARCHAR(100) NULL,
  event_location VARCHAR(255) NULL,
  baptism_year   INT          NULL,
  is_pinned      SMALLINT     DEFAULT 0,
  is_approved    SMALLINT     DEFAULT 1,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    VARCHAR(36) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  post_id    VARCHAR(36) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

CREATE TABLE IF NOT EXISTS baptism_records (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  full_name      VARCHAR(200) NOT NULL,
  baptism_date   DATE         NOT NULL,
  birth_date     DATE         NOT NULL,
  father_name    VARCHAR(200) NOT NULL,
  mother_name    VARCHAR(200) NOT NULL,
  godfather_name VARCHAR(200) NOT NULL,
  godmother_name VARCHAR(200) NULL,
  priest         VARCHAR(200) NOT NULL,
  location       VARCHAR(255) NOT NULL DEFAULT '',
  record_number  VARCHAR(50)  NOT NULL UNIQUE,
  parish_id      VARCHAR(100) NOT NULL DEFAULT 'parish',
  verified       SMALLINT     DEFAULT 0,
  notes          TEXT         NULL,
  created_by     VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_baptism_records_full_name    ON baptism_records(full_name);
CREATE INDEX IF NOT EXISTS idx_baptism_records_baptism_date ON baptism_records(baptism_date);

-- Internal sacramental records (replaces the external per-parish DB).
-- Matches the SVF external table's columns so the frontend is unchanged.
CREATE TABLE IF NOT EXISTS sacramental_records (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  name             VARCHAR(200) NOT NULL,
  birthday         VARCHAR(100) NULL,           -- kept as text: "September 24, 1995"
  parents_name     VARCHAR(300) NULL,
  baptized_by      VARCHAR(200) NULL,
  canonical_book   VARCHAR(100) NULL,
  baptismal_date   VARCHAR(100) NULL,
  godparents_name  VARCHAR(300) NULL,
  confirmed_by     VARCHAR(200) NULL,
  confirmbook_no   VARCHAR(100) NULL,
  confirmed_date   VARCHAR(100) NULL,
  confirm_sponsor  VARCHAR(300) NULL,
  created_by       VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sacramental_records_name ON sacramental_records(name);

-- BEC (Basic Ecclesial Community) monthly dues ledger.
CREATE TABLE IF NOT EXISTS becs (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS donors (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  address      VARCHAR(300) NULL,
  bec_id       VARCHAR(36)  NULL REFERENCES becs(id) ON DELETE SET NULL,
  gcash_number VARCHAR(20)  NULL,
  user_id      VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  is_active    SMALLINT     DEFAULT 1,
  notes        TEXT         NULL,
  created_by   VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_donors_name ON donors(name);
CREATE INDEX IF NOT EXISTS idx_donors_bec  ON donors(bec_id);

-- One ledger row per donor per month — upsert on the unique key.
CREATE TABLE IF NOT EXISTS contributions (
  id          VARCHAR(36)    NOT NULL PRIMARY KEY,
  donor_id    VARCHAR(36)    NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  year        SMALLINT       NOT NULL,
  month       SMALLINT       NOT NULL,
  amount      NUMERIC(12,2)  NOT NULL,
  method      VARCHAR(20)    NOT NULL DEFAULT 'cash',
  reference   VARCHAR(120)   NULL,
  receipt_url VARCHAR(500)   NULL,
  recorded_by VARCHAR(36)    NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (donor_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_contributions_year_month ON contributions(year, month);
CREATE INDEX IF NOT EXISTS idx_contributions_donor      ON contributions(donor_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36)  NULL REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  NULL,
  target_id   VARCHAR(36)  NULL,
  details     JSONB        NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

CREATE TABLE IF NOT EXISTS messages (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  sender_id   VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT         NOT NULL DEFAULT '',
  image_url   VARCHAR(500) NULL,
  is_read     SMALLINT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver     ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   VARCHAR(500) NOT NULL,
  p256dh     VARCHAR(255) NOT NULL,
  auth       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_endpoint ON push_subscriptions(user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Group chats
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS group_chats (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  avatar     VARCHAR(500) NULL,
  created_by VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  VARCHAR(36) NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id   VARCHAR(36) NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role      VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user  ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_messages (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  group_id   VARCHAR(36)  NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id  VARCHAR(36)  NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  content    TEXT         NOT NULL DEFAULT '',
  image_url  VARCHAR(500) NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_time  ON group_messages(group_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rewards & wallet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_points (
  user_id          VARCHAR(36) NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points     BIGINT      NOT NULL DEFAULT 0,
  purchased_points BIGINT      NOT NULL DEFAULT 0,
  gifted_points    BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     VARCHAR(50) NOT NULL,
  points     BIGINT      NOT NULL,
  ref_id     VARCHAR(36) NULL,
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pt_user       ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pt_action     ON point_transactions(action);
CREATE INDEX IF NOT EXISTS idx_pt_created_at ON point_transactions(created_at);

CREATE TABLE IF NOT EXISTS user_badges (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug VARCHAR(50) NOT NULL,
  earned_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badge ON user_badges(user_id, badge_slug);
CREATE INDEX IF NOT EXISTS idx_ub_user ON user_badges(user_id);

CREATE TABLE IF NOT EXISTS gbless_topup_requests (
  id            VARCHAR(36)    NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gcash_ref     VARCHAR(100)   NOT NULL,
  gcash_sender  VARCHAR(100)   NOT NULL,
  amount_php    DECIMAL(10,2)  NOT NULL,
  gbless_amount BIGINT         NOT NULL,
  receipt_url   VARCHAR(500)   NULL,
  status        VARCHAR(20)    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  admin_note    TEXT           NULL,
  reviewed_by   VARCHAR(36)    NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMP      NULL,
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_topup_user   ON gbless_topup_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_status ON gbless_topup_requests(status);

CREATE TABLE IF NOT EXISTS gbless_cashout_requests (
  id            VARCHAR(36)    NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gbless_amount BIGINT         NOT NULL,
  amount_php    DECIMAL(10,2)  NOT NULL,
  gcash_number  VARCHAR(20)    NOT NULL,
  gcash_name    VARCHAR(100)   NOT NULL,
  status        VARCHAR(20)    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  admin_note    TEXT           NULL,
  reviewed_by   VARCHAR(36)    NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMP      NULL,
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cashout_user   ON gbless_cashout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cashout_status ON gbless_cashout_requests(status);

CREATE TABLE IF NOT EXISTS gbless_gifts (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  sender_id     VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id   VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gbless_amount BIGINT       NOT NULL,
  message       VARCHAR(255) NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gifts_sender   ON gbless_gifts(sender_id);
CREATE INDEX IF NOT EXISTS idx_gifts_receiver ON gbless_gifts(receiver_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Family groups & ministries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_groups (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT         NULL,
  created_by  VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_group_members (
  group_id     VARCHAR(36) NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  relationship VARCHAR(20) NOT NULL DEFAULT 'other'
               CHECK (relationship IN ('parent','child','spouse','sibling','grandparent','grandchild','relative','other')),
  joined_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_fgm_group ON family_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_fgm_user  ON family_group_members(user_id);

CREATE TABLE IF NOT EXISTS ministries (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   TEXT         NULL,
  schedule      VARCHAR(255) NULL,
  contact_name  VARCHAR(100) NULL,
  contact_email VARCHAR(255) NULL,
  created_by    VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ministry_members (
  ministry_id VARCHAR(36) NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  joined_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ministry_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_mm_ministry ON ministry_members(ministry_id);
CREATE INDEX IF NOT EXISTS idx_mm_user     ON ministry_members(user_id);
