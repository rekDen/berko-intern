alter table contacts
  add column if not exists contact_persons jsonb not null default '[]'::jsonb;
