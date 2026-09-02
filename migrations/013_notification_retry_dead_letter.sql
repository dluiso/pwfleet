alter type notification_status add value if not exists 'dead_letter';
alter type report_delivery_status add value if not exists 'dead_letter';

alter table notification_outbox
  add column next_attempt_at timestamptz not null default now(),
  add column dead_lettered_at timestamptz;

create index notification_outbox_retry_idx on notification_outbox (status, next_attempt_at, created_at);
