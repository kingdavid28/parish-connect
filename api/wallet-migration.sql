-- GBless Wallet Migration
-- Run AFTER rewards-migration.sql
-- Run in Hostinger phpMyAdmin

-- Top-up requests: user sends GCash, submits reference, admin approves
CREATE TABLE IF NOT EXISTS gbless_topup_requests (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)   NOT NULL,
  gcash_ref     VARCHAR(100)  NOT NULL,          -- GCash reference number submitted by user
  gcash_sender  VARCHAR(100)  NOT NULL,          -- GCash name/number of sender
  amount_php    DECIMAL(10,2) NOT NULL,          -- PHP amount sent
  gbless_amount BIGINT        NOT NULL,          -- GBless to credit (amount_php * 10000)
  receipt_url   VARCHAR(500)  NULL,              -- uploaded screenshot of GCash receipt
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note    TEXT          NULL,
  reviewed_by   VARCHAR(36)   NULL,
  reviewed_at   DATETIME      NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_topup_user   ON gbless_topup_requests(user_id);
CREATE INDEX idx_topup_status ON gbless_topup_requests(status);

-- Cash-out requests: user requests PHP payout, admin processes manually
CREATE TABLE IF NOT EXISTS gbless_cashout_requests (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  user_id       VARCHAR(36)   NOT NULL,
  gbless_amount BIGINT        NOT NULL,          -- GBless to deduct
  amount_php    DECIMAL(10,2) NOT NULL,          -- PHP equivalent (gbless / 10000)
  gcash_number  VARCHAR(20)   NOT NULL,          -- User's GCash number to send to
  gcash_name    VARCHAR(100)  NOT NULL,          -- User's GCash registered name
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note    TEXT          NULL,
  reviewed_by   VARCHAR(36)   NULL,
  reviewed_at   DATETIME      NULL,
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_cashout_user   ON gbless_cashout_requests(user_id);
CREATE INDEX idx_cashout_status ON gbless_cashout_requests(status);

-- Peer-to-peer GBless gifts between users
CREATE TABLE IF NOT EXISTS gbless_gifts (
  id            VARCHAR(36)  NOT NULL PRIMARY KEY,
  sender_id     VARCHAR(36)  NOT NULL,
  receiver_id   VARCHAR(36)  NOT NULL,
  gbless_amount BIGINT       NOT NULL,
  message       VARCHAR(255) NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_gifts_sender   ON gbless_gifts(sender_id);
CREATE INDEX idx_gifts_receiver ON gbless_gifts(receiver_id);

-- Add purchased_points column to user_points to track bought vs earned separately
ALTER TABLE user_points
  ADD COLUMN IF NOT EXISTS purchased_points BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gifted_points    BIGINT NOT NULL DEFAULT 0;

-- If you already ran the migration without receipt_url, run this:
-- ALTER TABLE gbless_topup_requests ADD COLUMN IF NOT EXISTS receipt_url VARCHAR(500) NULL AFTER gbless_amount;
