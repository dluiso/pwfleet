create type report_frequency as enum ('daily', 'weekly', 'monthly', 'annual');
create type report_format as enum ('pdf', 'csv');
create type report_delivery_status as enum ('pending', 'captured', 'sent', 'failed');

create table report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  name varchar(160) not null,
  recipient_user_id uuid not null references users(id) on delete restrict,
  frequency report_frequency not null,
  format report_format not null,
  time_zone varchar(80) not null,
  delivery_hour_local integer not null,
  day_of_week integer,
  day_of_month integer,
  month_of_year integer,
  filters jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  record_version integer not null default 1,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_subscriptions_name_not_blank check (btrim(name) <> ''),
  constraint report_subscriptions_hour_range check (delivery_hour_local between 0 and 23),
  constraint report_subscriptions_weekday_range check (day_of_week is null or day_of_week between 0 and 6),
  constraint report_subscriptions_day_range check (day_of_month is null or day_of_month between 1 and 28),
  constraint report_subscriptions_month_range check (month_of_year is null or month_of_year between 1 and 12)
);

create index report_subscriptions_due_idx on report_subscriptions (active, next_run_at);
create index report_subscriptions_recipient_idx on report_subscriptions (recipient_user_id);

create table report_artifacts (
  id uuid primary key default gen_random_uuid(),
  report_key varchar(220) not null,
  format report_format not null,
  period_start date not null,
  period_end date not null,
  filters jsonb not null,
  storage_key varchar(255) not null,
  filename varchar(255) not null,
  mime_type varchar(100) not null,
  byte_size integer not null,
  sha256 varchar(64) not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint report_artifacts_size_positive check (byte_size > 0)
);

create unique index report_artifacts_report_key_unique on report_artifacts (report_key);
create unique index report_artifacts_storage_key_unique on report_artifacts (storage_key);
create index report_artifacts_expiry_idx on report_artifacts (expires_at);

create table report_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references report_subscriptions(id) on delete set null,
  artifact_id uuid not null references report_artifacts(id) on delete restrict,
  notification_outbox_id uuid references notification_outbox(id) on delete set null,
  delivery_key varchar(240) not null,
  recipient_email varchar(320) not null,
  status report_delivery_status not null default 'pending',
  scheduled_for timestamptz not null,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index report_deliveries_key_unique on report_deliveries (delivery_key);
create index report_deliveries_status_idx on report_deliveries (status, created_at);
create index report_deliveries_subscription_idx on report_deliveries (subscription_id, created_at desc);
