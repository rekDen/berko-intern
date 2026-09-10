-- Google Calendar OAuth-Verbindung pro Nutzer
create table if not exists google_calendar_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  tenant_id          uuid not null references tenants(id),
  google_email       text,
  access_token       text not null,
  refresh_token      text not null,
  token_expiry       timestamptz,
  google_calendar_id text not null default 'primary',
  sync_enabled       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table google_calendar_connections enable row level security;

-- Tokens werden ausschließlich serverseitig über den Admin-Client (service_role) gelesen/geschrieben.
-- Keine Client-Policy → Browser hat keinen Zugriff auf die Tokens.

-- Verknüpfung: gespiegeltes Google-Event je Frist/Termin (für Update/Delete-Sync)
alter table deadlines add column if not exists google_event_id text;
