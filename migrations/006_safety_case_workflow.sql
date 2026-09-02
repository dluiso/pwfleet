create type safety_case_status as enum (
  'pending_supervisor_review',
  'acknowledged',
  'held',
  'maintenance_assigned',
  'repair_in_progress',
  'awaiting_reinspection',
  'awaiting_release',
  'released'
);

create type safety_case_action as enum (
  'created',
  'acknowledged',
  'held',
  'maintenance_assigned',
  'repair_started',
  'repair_completed',
  'reinspection_submitted',
  'release_approved',
  'release_denied'
);

create table safety_cases (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  source_submission_id uuid not null references inspection_submissions(id) on delete restrict,
  reinspection_submission_id uuid references inspection_submissions(id) on delete restrict,
  status safety_case_status not null default 'pending_supervisor_review',
  assigned_technician_user_id uuid references users(id) on delete set null,
  summary varchar(240),
  supervisor_note text,
  resolution_note text,
  record_version integer not null default 1,
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid references users(id) on delete set null,
  assigned_at timestamptz,
  assigned_by_user_id uuid references users(id) on delete set null,
  repair_started_at timestamptz,
  repair_started_by_user_id uuid references users(id) on delete set null,
  repair_completed_at timestamptz,
  repair_completed_by_user_id uuid references users(id) on delete set null,
  released_at timestamptz,
  released_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_cases_record_version_positive check (record_version > 0),
  constraint safety_cases_reinspection_distinct check (
    reinspection_submission_id is null or reinspection_submission_id <> source_submission_id
  )
);

create unique index safety_cases_source_submission_unique on safety_cases (source_submission_id);
create unique index safety_cases_reinspection_submission_unique
  on safety_cases (reinspection_submission_id)
  where reinspection_submission_id is not null;
create index safety_cases_vehicle_status_idx on safety_cases (vehicle_id, status);
create index safety_cases_assigned_technician_idx on safety_cases (assigned_technician_user_id, status);

create table safety_case_events (
  id uuid primary key default gen_random_uuid(),
  safety_case_id uuid not null references safety_cases(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action safety_case_action not null,
  from_status safety_case_status,
  to_status safety_case_status not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index safety_case_events_case_created_idx on safety_case_events (safety_case_id, created_at);

insert into safety_cases (vehicle_id, source_submission_id, status, summary)
select s.vehicle_id, s.id, 'pending_supervisor_review', 'Inspection requires supervisor review'
from inspection_submissions s
where s.status = 'pending_review'
on conflict (source_submission_id) do nothing;

insert into safety_case_events (safety_case_id, action, to_status, note, metadata)
select c.id, 'created', c.status, 'Backfilled from an existing pending inspection.', jsonb_build_object('backfilled', true)
from safety_cases c
where not exists (
  select 1 from safety_case_events e where e.safety_case_id = c.id
);
