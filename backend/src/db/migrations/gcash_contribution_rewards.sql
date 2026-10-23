ALTER TABLE contribution_payments
  ADD COLUMN IF NOT EXISTS gcash_sender VARCHAR(100) NULL;

CREATE TABLE IF NOT EXISTS gcash_reference_claims (
  gcash_ref    VARCHAR(120) NOT NULL PRIMARY KEY,
  source_type  VARCHAR(20)  NOT NULL CHECK (source_type IN ('topup', 'contribution')),
  source_id    VARCHAR(36)  NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_type, source_id)
);

INSERT INTO gcash_reference_claims (gcash_ref, source_type, source_id)
SELECT UPPER(TRIM(gcash_ref)), 'topup', id
FROM gbless_topup_requests
WHERE status <> 'rejected' AND TRIM(gcash_ref) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO gcash_reference_claims (gcash_ref, source_type, source_id)
SELECT UPPER(TRIM(reference)), 'contribution', id
FROM contribution_payments
WHERE status IN ('pending', 'confirmed') AND method = 'gcash'
  AND reference IS NOT NULL AND TRIM(reference) <> ''
ON CONFLICT DO NOTHING;
