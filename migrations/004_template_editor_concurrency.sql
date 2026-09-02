alter table inspection_templates
  add column record_version integer not null default 1,
  add constraint inspection_templates_record_version_positive check (record_version > 0);
