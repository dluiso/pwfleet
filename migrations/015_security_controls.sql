CREATE TABLE request_rate_limits (
  scope varchar(80) NOT NULL,
  key_hash varchar(64) NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash, window_start),
  CONSTRAINT request_rate_limits_count_positive CHECK (request_count > 0)
);

CREATE INDEX request_rate_limits_cleanup_idx ON request_rate_limits (window_start);
