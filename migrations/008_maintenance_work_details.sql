create type safety_case_priority as enum ('routine', 'urgent', 'critical');
create type maintenance_work_entry_type as enum ('labor', 'part', 'external_service', 'note');
create type safety_case_evidence_category as enum ('before_repair', 'after_repair', 'invoice', 'receipt', 'other');

alter table safety_cases
  add column priority safety_case_priority not null default 'urgent',
  add column target_resolution_at timestamptz,
  add column service_provider varchar(180),
  add column external_reference varchar(120);

create index safety_cases_priority_due_idx on safety_cases (status, priority, target_resolution_at);

create table maintenance_work_entries (
  id uuid primary key default gen_random_uuid(),
  safety_case_id uuid not null references safety_cases(id) on delete cascade,
  entry_type maintenance_work_entry_type not null,
  description varchar(500) not null,
  part_number varchar(120),
  quantity integer not null default 1,
  cost_cents integer not null default 0,
  labor_minutes integer not null default 0,
  vendor_name varchar(180),
  entered_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint maintenance_work_entries_description_not_blank check (btrim(description) <> ''),
  constraint maintenance_work_entries_quantity_positive check (quantity > 0),
  constraint maintenance_work_entries_cost_nonnegative check (cost_cents >= 0),
  constraint maintenance_work_entries_labor_nonnegative check (labor_minutes >= 0)
);

create index maintenance_work_entries_case_idx on maintenance_work_entries (safety_case_id, created_at);

create table safety_case_attachments (
  safety_case_id uuid not null references safety_cases(id) on delete cascade,
  attachment_id uuid not null references attachments(id) on delete restrict,
  category safety_case_evidence_category not null,
  caption varchar(500),
  linked_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (safety_case_id, attachment_id)
);

create index safety_case_attachments_attachment_idx on safety_case_attachments (attachment_id);

update safety_cases c
set priority = case
      when s.calculated_severity = 'critical' then 'critical'::safety_case_priority
      when s.calculated_severity in ('major', 'minor') then 'urgent'::safety_case_priority
      else 'routine'::safety_case_priority
    end,
    target_resolution_at = c.created_at + case
      when s.calculated_severity = 'critical' then interval '4 hours'
      when s.calculated_severity in ('major', 'minor') then interval '24 hours'
      else interval '72 hours'
    end
from inspection_submissions s
where s.id = c.source_submission_id
  and c.target_resolution_at is null;
