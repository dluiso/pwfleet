create extension if not exists pgcrypto;

create type user_role as enum (
  'driver',
  'supervisor',
  'fleet_manager',
  'maintenance_technician',
  'administrator',
  'auditor'
);

create type vehicle_lifecycle_status as enum ('active', 'inactive', 'disposed');

create type vehicle_disposition as enum (
  'inspection_required',
  'cleared',
  'cleared_with_advisory',
  'hold_for_review',
  'out_of_service',
  'maintenance_in_progress',
  'ready_for_reinspection'
);

create type qr_status as enum ('active', 'damaged', 'replaced', 'revoked');
create type template_status as enum ('draft', 'published', 'retired');
create type rule_set_status as enum ('draft', 'approved');

create type inspection_field_type as enum (
  'pass_defect_na',
  'text',
  'textarea',
  'number',
  'odometer',
  'fuel_level',
  'photo',
  'attestation',
  'damage_map',
  'select'
);

create type defect_severity as enum ('none', 'advisory', 'minor', 'major', 'critical');
create type inspection_submission_status as enum ('draft', 'submitted', 'pending_review', 'closed');

create type defect_status as enum (
  'reported',
  'under_review',
  'assigned',
  'repair_in_progress',
  'repair_completed',
  'verification_required',
  'closed'
);

create type notification_status as enum ('pending', 'captured', 'sent', 'failed');
create type notification_urgency as enum ('normal', 'critical');

create type assignment_frequency as enum (
  'before_first_departure',
  'end_of_shift',
  'daily',
  'per_handover',
  'on_demand'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar(320) not null,
  display_name varchar(160) not null,
  role user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_unique on users (lower(email));

create table vehicle_classes (
  id uuid primary key default gen_random_uuid(),
  code varchar(12) not null,
  name varchar(120) not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_classes_code_format check (code ~ '^[A-Z0-9]{1,12}$')
);

create unique index vehicle_classes_code_unique on vehicle_classes (upper(code));

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  unit_number varchar(24) not null,
  display_code varchar(40),
  vehicle_class_id uuid not null references vehicle_classes(id) on delete restrict,
  vin varchar(17),
  license_plate varchar(32),
  license_state varchar(3),
  year integer,
  make varchar(80),
  model varchar(120),
  current_odometer integer,
  lifecycle_status vehicle_lifecycle_status not null default 'active',
  disposition vehicle_disposition not null default 'inspection_required',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_unit_number_not_blank check (btrim(unit_number) <> ''),
  constraint vehicles_display_code_not_blank check (display_code is null or btrim(display_code) <> ''),
  constraint vehicles_vin_length check (vin is null or char_length(vin) = 17),
  constraint vehicles_year_range check (year is null or year between 1900 and 2200),
  constraint vehicles_odometer_nonnegative check (current_odometer is null or current_odometer >= 0)
);

create unique index vehicles_unit_number_unique on vehicles (unit_number);
create unique index vehicles_display_code_unique on vehicles (display_code) where display_code is not null;
create unique index vehicles_vin_unique on vehicles (vin) where vin is not null;
create index vehicles_class_idx on vehicles (vehicle_class_id);
create index vehicles_disposition_idx on vehicles (disposition);

create table vehicle_qr_codes (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  public_id uuid not null default gen_random_uuid(),
  status qr_status not null default 'active',
  issued_by_user_id uuid references users(id) on delete set null,
  activated_at timestamptz not null default now(),
  last_scanned_at timestamptz,
  replaced_by_qr_code_id uuid,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_qr_codes_revocation_consistency check (
    (status in ('revoked', 'replaced') and revoked_at is not null)
    or (status not in ('revoked', 'replaced'))
  )
);

alter table vehicle_qr_codes
  add constraint vehicle_qr_codes_replaced_by_fk
  foreign key (replaced_by_qr_code_id) references vehicle_qr_codes(id) on delete set null;

create unique index vehicle_qr_codes_public_id_unique on vehicle_qr_codes (public_id);
create unique index vehicle_qr_codes_one_active_per_vehicle
  on vehicle_qr_codes (vehicle_id) where status = 'active';
create index vehicle_qr_codes_vehicle_idx on vehicle_qr_codes (vehicle_id);

create table inspection_templates (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null,
  name varchar(180) not null,
  description text,
  version integer not null,
  status template_status not null default 'draft',
  effective_from date,
  published_at timestamptz,
  rule_set_status rule_set_status not null default 'draft',
  rules_approved_at timestamptz,
  rules_approved_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_templates_version_positive check (version > 0),
  constraint inspection_templates_code_format check (code ~ '^[A-Z0-9_]{2,64}$'),
  constraint inspection_templates_publication_consistency check (
    (status = 'published' and published_at is not null)
    or status <> 'published'
  ),
  constraint inspection_templates_rule_approval_consistency check (
    (rule_set_status = 'approved' and rules_approved_at is not null and rules_approved_by_user_id is not null)
    or (rule_set_status = 'draft' and rules_approved_at is null)
  )
);

create unique index inspection_templates_code_version_unique
  on inspection_templates (code, version);
create index inspection_templates_status_idx on inspection_templates (status);

create table inspection_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references inspection_templates(id) on delete cascade,
  section_key varchar(80) not null,
  title varchar(180) not null,
  description text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_sections_sort_nonnegative check (sort_order >= 0)
);

create unique index inspection_sections_key_unique
  on inspection_sections (template_id, section_key);
create index inspection_sections_template_idx on inspection_sections (template_id);

create table inspection_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references inspection_templates(id) on delete cascade,
  section_id uuid not null references inspection_sections(id) on delete cascade,
  item_key varchar(100) not null,
  label varchar(240) not null,
  help_text text,
  field_type inspection_field_type not null,
  required boolean not null default true,
  sort_order integer not null,
  options jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_items_sort_nonnegative check (sort_order >= 0),
  constraint inspection_items_options_array check (options is null or jsonb_typeof(options) = 'array')
);

create unique index inspection_items_key_unique on inspection_items (template_id, item_key);
create index inspection_items_section_idx on inspection_items (section_id);

create table inspection_item_rules (
  id uuid primary key default gen_random_uuid(),
  inspection_item_id uuid not null references inspection_items(id) on delete cascade,
  when_response varchar(80) not null,
  severity defect_severity not null,
  disposition vehicle_disposition not null,
  block_departure boolean not null default false,
  require_comment boolean not null default false,
  require_photo boolean not null default false,
  create_defect boolean not null default false,
  notify_driver boolean not null default false,
  notify_supervisor boolean not null default false,
  notify_maintenance boolean not null default false,
  driver_message text,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_item_rules_blocking_consistency check (
    not block_departure or disposition in ('hold_for_review', 'out_of_service', 'maintenance_in_progress')
  ),
  constraint inspection_item_rules_critical_consistency check (
    severity <> 'critical' or block_departure
  )
);

create unique index inspection_item_rules_response_unique
  on inspection_item_rules (inspection_item_id, when_response);
create index inspection_item_rules_item_idx on inspection_item_rules (inspection_item_id);

create table vehicle_inspection_assignments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  template_id uuid not null references inspection_templates(id) on delete restrict,
  frequency assignment_frequency not null,
  auto_launch boolean not null default false,
  effective_from date not null default current_date,
  effective_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_inspection_assignments_date_range check (
    effective_until is null or effective_until >= effective_from
  )
);

create unique index vehicle_inspection_assignments_unique
  on vehicle_inspection_assignments (vehicle_id, template_id, effective_from);
create index vehicle_inspection_assignments_vehicle_idx
  on vehicle_inspection_assignments (vehicle_id);

create table inspection_submissions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  template_id uuid not null references inspection_templates(id) on delete restrict,
  template_version integer not null,
  inspector_user_id uuid not null references users(id) on delete restrict,
  qr_code_id uuid references vehicle_qr_codes(id) on delete set null,
  status inspection_submission_status not null default 'draft',
  calculated_severity defect_severity not null default 'none',
  calculated_disposition vehicle_disposition not null default 'inspection_required',
  odometer integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_submissions_odometer_nonnegative check (odometer is null or odometer >= 0),
  constraint inspection_submissions_completion_consistency check (
    (status = 'draft' and submitted_at is null)
    or (status <> 'draft' and submitted_at is not null)
  )
);

create index inspection_submissions_vehicle_idx on inspection_submissions (vehicle_id);
create index inspection_submissions_status_idx on inspection_submissions (status);
create index inspection_submissions_submitted_idx on inspection_submissions (submitted_at);

create table inspection_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references inspection_submissions(id) on delete cascade,
  inspection_item_id uuid not null references inspection_items(id) on delete restrict,
  response jsonb not null,
  comment text,
  calculated_severity defect_severity not null default 'none',
  applied_rule_id uuid references inspection_item_rules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inspection_answers_item_unique
  on inspection_answers (submission_id, inspection_item_id);
create index inspection_answers_submission_idx on inspection_answers (submission_id);

create table defects (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  submission_id uuid not null references inspection_submissions(id) on delete restrict,
  answer_id uuid references inspection_answers(id) on delete set null,
  title varchar(240) not null,
  description text,
  severity defect_severity not null,
  status defect_status not null default 'reported',
  blocks_departure boolean not null default false,
  reported_by_user_id uuid not null references users(id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint defects_closed_consistency check (
    (status = 'closed' and closed_at is not null)
    or status <> 'closed'
  ),
  constraint defects_critical_blocks check (severity <> 'critical' or blocks_departure)
);

create index defects_vehicle_idx on defects (vehicle_id);
create index defects_status_idx on defects (status);
create index defects_severity_idx on defects (severity);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key varchar(160) not null,
  recipient_user_id uuid references users(id) on delete set null,
  recipient_email varchar(320),
  urgency notification_urgency not null default 'normal',
  subject varchar(240) not null,
  template_key varchar(120) not null,
  payload jsonb not null,
  status notification_status not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_recipient_required check (
    recipient_user_id is not null or recipient_email is not null
  ),
  constraint notification_outbox_attempt_nonnegative check (attempt_count >= 0),
  constraint notification_outbox_sent_consistency check (
    (status = 'sent' and sent_at is not null)
    or status <> 'sent'
  )
);

create unique index notification_outbox_event_recipient_unique
  on notification_outbox (event_key, recipient_email);
create index notification_outbox_status_idx on notification_outbox (status);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  event_type varchar(120) not null,
  entity_type varchar(80) not null,
  entity_id uuid,
  request_id uuid,
  ip_hash varchar(128),
  metadata jsonb not null,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on audit_events (entity_type, entity_id);
create index audit_events_created_idx on audit_events (created_at);

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'vehicle_classes',
    'vehicles',
    'vehicle_qr_codes',
    'inspection_templates',
    'inspection_sections',
    'inspection_items',
    'inspection_item_rules',
    'vehicle_inspection_assignments',
    'inspection_submissions',
    'inspection_answers',
    'defects',
    'notification_outbox'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
