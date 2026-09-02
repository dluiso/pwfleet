create table integration_settings (
  id integer primary key default 1 check (id = 1),
  authentication_mode varchar(20) not null default 'local' check (authentication_mode in ('local', 'oidc')),
  oidc_issuer varchar(500),
  oidc_client_id varchar(300),
  oidc_client_secret_ciphertext text,
  oidc_client_auth_method varchar(40) not null default 'client_secret_basic' check (oidc_client_auth_method in ('client_secret_basic', 'client_secret_post')),
  oidc_scopes varchar(500) not null default 'openid profile email',
  oidc_clock_tolerance_seconds integer not null default 30 check (oidc_clock_tolerance_seconds between 0 and 300),
  email_mode varchar(20) not null default 'capture' check (email_mode in ('capture', 'smtp')),
  smtp_host varchar(255),
  smtp_port integer check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default false,
  smtp_auth_mode varchar(20) not null default 'none' check (smtp_auth_mode in ('none', 'password', 'oauth2')),
  smtp_username varchar(320),
  smtp_password_ciphertext text,
  smtp_oauth_tenant_id varchar(200),
  smtp_oauth_client_id varchar(300),
  smtp_oauth_client_secret_ciphertext text,
  email_from varchar(500),
  record_version integer not null default 1,
  updated_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into integration_settings (id) values (1) on conflict (id) do nothing;
