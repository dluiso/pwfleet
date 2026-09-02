alter table users
  add column record_version integer not null default 1,
  add constraint users_record_version_positive check (record_version > 0);

alter table vehicles
  add column record_version integer not null default 1,
  add constraint vehicles_record_version_positive check (record_version > 0);
