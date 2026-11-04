alter table inspection_templates
  drop constraint if exists inspection_templates_active_review_consistency;

alter table inspection_templates
  add constraint inspection_templates_active_review_consistency check (
    review_status <> 'in_review'
    or (
      review_requested_at is not null
      and review_requested_by_user_id is not null
      and review_definition_hash is not null
    )
  );

do $$
declare
  approver_id uuid;
begin
  select id
    into approver_id
    from users
   where role = 'administrator' and active = true
   order by created_at
   limit 1;

  if approver_id is null and exists (
    select 1
      from inspection_templates
     where status = 'published'
       and (rule_set_status <> 'approved' or review_status <> 'approved')
  ) then
    raise exception 'An active administrator is required to normalize published forms';
  end if;

  update inspection_templates
     set rule_set_status = 'approved',
         rules_approved_at = coalesce(rules_approved_at, published_at, now()),
         rules_approved_by_user_id = coalesce(rules_approved_by_user_id, published_by_user_id, approver_id),
         review_status = 'approved',
         record_version = record_version + 1,
         updated_at = now()
   where status = 'published'
     and (rule_set_status <> 'approved' or review_status <> 'approved');
end $$;

alter table inspection_templates
  add constraint inspection_templates_published_assignable_consistency check (
    status <> 'published'
    or (rule_set_status = 'approved' and review_status = 'approved')
  );
