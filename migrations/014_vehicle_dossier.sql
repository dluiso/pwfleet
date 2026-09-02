ALTER TABLE vehicles
  ADD COLUMN asset_tag varchar(64),
  ADD COLUMN acquisition_date date,
  ADD COLUMN purchase_cost_cents integer,
  ADD COLUMN in_service_date date,
  ADD COLUMN fuel_type varchar(40),
  ADD COLUMN ownership_type varchar(40),
  ADD COLUMN primary_location varchar(160),
  ADD COLUMN notes text;

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_purchase_cost_nonnegative
  CHECK (purchase_cost_cents IS NULL OR purchase_cost_cents >= 0);

CREATE UNIQUE INDEX vehicles_asset_tag_unique
  ON vehicles (upper(asset_tag))
  WHERE asset_tag IS NOT NULL;

CREATE TYPE vehicle_document_category AS ENUM (
  'profile_photo',
  'registration',
  'insurance',
  'title',
  'warranty',
  'service_record',
  'other'
);

CREATE TABLE vehicle_attachments (
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
  category vehicle_document_category NOT NULL,
  caption varchar(500),
  effective_date date,
  expires_on date,
  is_primary boolean NOT NULL DEFAULT false,
  linked_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  retired_at timestamptz,
  retired_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  retirement_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, attachment_id),
  CONSTRAINT vehicle_attachments_primary_photo_only
    CHECK (NOT is_primary OR category = 'profile_photo')
);

CREATE UNIQUE INDEX vehicle_attachments_attachment_unique
  ON vehicle_attachments (attachment_id);

CREATE UNIQUE INDEX vehicle_attachments_one_primary_photo
  ON vehicle_attachments (vehicle_id)
  WHERE is_primary AND retired_at IS NULL;

CREATE INDEX vehicle_attachments_vehicle_category_idx
  ON vehicle_attachments (vehicle_id, category, created_at DESC);

CREATE INDEX vehicle_attachments_expiry_idx
  ON vehicle_attachments (expires_on)
  WHERE expires_on IS NOT NULL;
