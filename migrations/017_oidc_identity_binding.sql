ALTER TABLE users
  ADD COLUMN oidc_issuer varchar(500),
  ADD COLUMN oidc_subject varchar(500),
  ADD COLUMN identity_bound_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_oidc_binding_complete
  CHECK (
    (oidc_issuer IS NULL AND oidc_subject IS NULL AND identity_bound_at IS NULL)
    OR
    (oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL AND identity_bound_at IS NOT NULL)
  );

CREATE UNIQUE INDEX users_oidc_identity_unique
  ON users (oidc_issuer, oidc_subject)
  WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;
