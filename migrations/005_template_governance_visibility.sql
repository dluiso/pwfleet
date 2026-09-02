create type template_review_status as enum ('draft', 'in_review', 'changes_requested', 'approved');
create type template_review_lane as enum ('operations', 'governance');
create type template_review_decision as enum ('approved', 'changes_requested');

alter table inspection_templates
  add column review_status template_review_status not null default 'draft',
  add column review_round integer not null default 0,
  add column review_requested_at timestamptz,
  add column review_requested_by_user_id uuid references users(id) on delete set null,
  add column review_definition_hash varchar(64),
  add column published_by_user_id uuid references users(id) on delete set null,
  add column retired_at timestamptz,
  add column retired_by_user_id uuid references users(id) on delete set null,
  add constraint inspection_templates_review_round_nonnegative check (review_round >= 0),
  add constraint inspection_templates_review_hash_format check (
    review_definition_hash is null or review_definition_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint inspection_templates_active_review_consistency check (
    review_status not in ('in_review', 'approved')
    or (review_requested_at is not null and review_requested_by_user_id is not null and review_definition_hash is not null)
  );

alter table inspection_items
  add column visibility_condition jsonb,
  add constraint inspection_items_visibility_object check (
    visibility_condition is null or jsonb_typeof(visibility_condition) = 'object'
  );

create table inspection_template_reviews (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references inspection_templates(id) on delete cascade,
  review_round integer not null,
  definition_hash varchar(64) not null,
  review_lane template_review_lane not null,
  decision template_review_decision not null,
  reviewer_user_id uuid not null references users(id) on delete restrict,
  comment text,
  created_at timestamptz not null default now(),
  constraint inspection_template_reviews_round_positive check (review_round > 0),
  constraint inspection_template_reviews_hash_format check (definition_hash ~ '^[a-f0-9]{64}$')
);

create unique index inspection_template_reviews_lane_unique
  on inspection_template_reviews (template_id, review_round, review_lane);
create index inspection_template_reviews_template_idx
  on inspection_template_reviews (template_id, review_round);
