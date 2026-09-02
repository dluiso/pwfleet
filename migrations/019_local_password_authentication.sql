ALTER TABLE users
  ADD COLUMN local_password_hash varchar(512),
  ADD COLUMN local_password_changed_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_local_password_complete
  CHECK (
    (local_password_hash IS NULL AND local_password_changed_at IS NULL)
    OR
    (local_password_hash IS NOT NULL AND local_password_changed_at IS NOT NULL)
  );
