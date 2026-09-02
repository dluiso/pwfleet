create type attachment_status as enum ('pending', 'linked', 'quarantined');

create table attachments (
  id uuid primary key default gen_random_uuid(),
  uploaded_by_user_id uuid not null references users(id) on delete restrict,
  storage_key varchar(255) not null,
  original_name varchar(255) not null,
  mime_type varchar(100) not null,
  byte_size integer not null,
  sha256 varchar(64) not null,
  status attachment_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint attachments_byte_size_positive check (byte_size > 0),
  constraint attachments_sha256_format check (sha256 ~ '^[0-9a-f]{64}$')
);

create unique index attachments_storage_key_unique on attachments (storage_key);
create index attachments_uploader_idx on attachments (uploaded_by_user_id);
create index attachments_status_idx on attachments (status);

create table inspection_answer_attachments (
  inspection_answer_id uuid not null references inspection_answers(id) on delete cascade,
  attachment_id uuid not null references attachments(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index inspection_answer_attachments_unique
  on inspection_answer_attachments (inspection_answer_id, attachment_id);
create index inspection_answer_attachments_attachment_idx
  on inspection_answer_attachments (attachment_id);

