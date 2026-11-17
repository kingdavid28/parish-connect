-- Marriage & Death registry tables for the PHP/MySQL API.
-- Run once in phpMyAdmin (select the parish_connect database → SQL tab).
-- Mirrors backend/src/db/schema.pg.sql for the Node/CockroachDB stack.

CREATE TABLE IF NOT EXISTS marriage_records (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  groom_name        VARCHAR(200) NOT NULL,
  bride_name        VARCHAR(200) NOT NULL,
  marriage_date     DATE         NOT NULL,
  groom_father_name VARCHAR(200) NULL,
  groom_mother_name VARCHAR(200) NULL,
  bride_father_name VARCHAR(200) NULL,
  bride_mother_name VARCHAR(200) NULL,
  sponsors_names    VARCHAR(400) NULL,
  priest            VARCHAR(200) NOT NULL,
  location          VARCHAR(255) NULL,
  record_number     VARCHAR(50)  NOT NULL,
  contract_no       VARCHAR(100) NULL,
  parish_id         VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  notes             TEXT         NULL,
  created_by        VARCHAR(36)  NULL,
  created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marriage_record_number (record_number),
  INDEX idx_marriage_groom (groom_name),
  INDEX idx_marriage_bride (bride_name),
  INDEX idx_marriage_date  (marriage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS death_records (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  full_name      VARCHAR(200) NOT NULL,
  death_date     DATE         NOT NULL,
  birth_date     DATE         NULL,
  age            SMALLINT     NULL,
  residence      VARCHAR(255) NULL,
  spouse_name    VARCHAR(200) NULL,
  informant_name VARCHAR(200) NULL,
  cause_of_death VARCHAR(255) NULL,
  cemetery       VARCHAR(255) NULL,
  priest         VARCHAR(200) NULL,
  record_number  VARCHAR(50)  NOT NULL,
  parish_id      VARCHAR(100) NOT NULL DEFAULT 'st-marys',
  notes          TEXT         NULL,
  created_by     VARCHAR(36)  NULL,
  created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_death_record_number (record_number),
  INDEX idx_death_name (full_name),
  INDEX idx_death_date (death_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
