ALTER TABLE report_artifacts ADD COLUMN purged_at timestamptz;

CREATE INDEX report_artifacts_purge_idx
  ON report_artifacts (expires_at)
  WHERE purged_at IS NULL;
