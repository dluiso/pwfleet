alter type safety_case_action add value if not exists 'maintenance_reassigned';
alter type safety_case_action add value if not exists 'estimate_submitted';
alter type safety_case_action add value if not exists 'estimate_approved';
alter type safety_case_action add value if not exists 'estimate_rejected';
alter type safety_case_action add value if not exists 'escalated';

create type maintenance_estimate_status as enum ('not_required', 'pending', 'approved', 'rejected');
create type user_notification_kind as enum ('inspection', 'safety_case', 'maintenance', 'report', 'system');

alter table safety_cases
  add column estimated_cost_cents integer,
  add column estimate_status maintenance_estimate_status not null default 'not_required',
  add column estimate_note varchar(1000),
  add column estimate_submitted_at timestamptz,
  add column estimate_submitted_by_user_id uuid references users(id) on delete set null,
  add column estimate_reviewed_at timestamptz,
  add column estimate_reviewed_by_user_id uuid references users(id) on delete set null,
  add constraint safety_cases_estimated_cost_nonnegative check (estimated_cost_cents is null or estimated_cost_cents >= 0);

create table user_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key varchar(180) not null,
  user_id uuid not null references users(id) on delete cascade,
  kind user_notification_kind not null,
  urgency notification_urgency not null default 'normal',
  title varchar(240) not null,
  body varchar(1000) not null,
  href varchar(500),
  requires_acknowledgment boolean not null default false,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_event_key_not_blank check (btrim(event_key) <> ''),
  constraint user_notifications_title_not_blank check (btrim(title) <> ''),
  constraint user_notifications_body_not_blank check (btrim(body) <> ''),
  constraint user_notifications_ack_requires_read check (acknowledged_at is null or read_at is not null)
);

create unique index user_notifications_event_user_unique on user_notifications (event_key, user_id);
create index user_notifications_user_unread_idx on user_notifications (user_id, read_at, created_at desc);
create index user_notifications_user_ack_idx on user_notifications (user_id, acknowledged_at, created_at desc)
  where requires_acknowledgment = true;

create table maintenance_escalation_policies (
  priority safety_case_priority primary key,
  acknowledgment_minutes integer not null,
  assignment_minutes integer not null,
  overdue_repeat_minutes integer not null,
  estimate_approval_threshold_cents integer not null,
  active boolean not null default true,
  record_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_escalation_ack_positive check (acknowledgment_minutes > 0),
  constraint maintenance_escalation_assignment_positive check (assignment_minutes > 0),
  constraint maintenance_escalation_repeat_positive check (overdue_repeat_minutes > 0),
  constraint maintenance_escalation_threshold_nonnegative check (estimate_approval_threshold_cents >= 0)
);

insert into maintenance_escalation_policies
  (priority, acknowledgment_minutes, assignment_minutes, overdue_repeat_minutes, estimate_approval_threshold_cents)
values
  ('routine', 120, 480, 1440, 250000),
  ('urgent', 30, 120, 240, 100000),
  ('critical', 15, 60, 60, 50000);

insert into user_notifications
  (event_key, user_id, kind, urgency, title, body, href, requires_acknowledgment, created_at)
select
  o.event_key || ':backfill',
  o.recipient_user_id,
  case when o.payload ? 'safetyCaseId' then 'safety_case'::user_notification_kind else 'inspection'::user_notification_kind end,
  o.urgency,
  o.subject,
  case when o.urgency = 'critical'
    then 'Review this critical fleet alert and follow the recorded vehicle disposition.'
    else 'Review this fleet notification and its associated operational record.'
  end,
  case
    when o.payload ? 'safetyCaseId' then '/maintenance/' || (o.payload ->> 'safetyCaseId')
    when o.payload ? 'inspectionId' then '/inspections'
    else null
  end,
  o.urgency = 'critical',
  o.created_at
from notification_outbox o
where o.recipient_user_id is not null
on conflict do nothing;
