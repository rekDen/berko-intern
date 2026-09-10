-- ============================================================
-- Newsletter / E-Mail-Kampagnen
-- Ausführen im Supabase SQL-Editor.
-- ============================================================

-- Kampagnen
create table if not exists newsletter_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  created_by          uuid not null references profiles(id),
  name                text not null,
  subject             text not null default '',
  body_html           text not null default '',
  -- Bewusst EIN Absender-Account pro Kampagne. Verteilen über mehrere
  -- Postfächer, um IONOS-Stundenlimits zu umgehen, ist ein Spam-Muster
  -- (verstößt gegen die IONOS-AGB) und bringt keinen echten Vorteil, da alle
  -- akturio.com-Postfächer dieselbe Domain-/IP-Reputation teilen.
  sender_account_id   uuid references email_accounts(id),
  status              text not null default 'draft'
                        check (status in ('draft','scheduled','sending','paused','sent','failed')),
  scheduled_at        timestamptz,
  -- IONOS staffelt Sendelimits nach Postfachalter: frische Postfächer ~50/Std,
  -- nach ~15 Tagen einige hundert. 30/Std ist ein sicherer Default mit Marge;
  -- die Obergrenze verhindert versehentliche Account-Sperren.
  throttle_per_hour   int not null default 30 check (throttle_per_hour between 1 and 200),
  track_opens         boolean not null default true,
  -- Zielgruppe aus Kontakten
  segment             jsonb not null default '{}'::jsonb,  -- {all:bool, categories:[], lead_sources:[]}
  manual_recipients   jsonb not null default '[]'::jsonb,  -- [{email,name}]
  total_recipients    int not null default 0,
  sent_count          int not null default 0,
  failed_count        int not null default 0,
  opened_count        int not null default 0,
  unsubscribed_count  int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index if not exists idx_newsletter_campaigns_tenant on newsletter_campaigns(tenant_id);
create index if not exists idx_newsletter_campaigns_status on newsletter_campaigns(status);

-- Empfänger je Kampagne (materialisierte Sendeliste)
create table if not exists newsletter_recipients (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references newsletter_campaigns(id) on delete cascade,
  tenant_id    uuid not null references tenants(id),
  contact_id   uuid references contacts(id) on delete set null,
  email        text not null,
  name         text,
  account_id   uuid references email_accounts(id),  -- zugewiesener Absender
  status       text not null default 'pending'
                 check (status in ('pending','sent','failed','unsubscribed','skipped')),
  error        text,
  token        uuid not null default gen_random_uuid(),  -- Tracking + Abmeldung
  opened_at    timestamptz,
  open_count   int not null default 0,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists idx_newsletter_recipients_campaign on newsletter_recipients(campaign_id);
create index if not exists idx_newsletter_recipients_pending on newsletter_recipients(campaign_id, status);
create index if not exists idx_newsletter_recipients_token on newsletter_recipients(token);

-- Abmeldungen (Suppression-Liste, mandantenweit)
create table if not exists newsletter_unsubscribes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  email            text not null,
  campaign_id      uuid references newsletter_campaigns(id) on delete set null,
  unsubscribed_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists idx_newsletter_unsub_tenant_email on newsletter_unsubscribes(tenant_id, lower(email));

-- ── RLS ──────────────────────────────────────────────────────
alter table newsletter_campaigns   enable row level security;
alter table newsletter_recipients  enable row level security;
alter table newsletter_unsubscribes enable row level security;

create policy "nl_campaigns_all" on newsletter_campaigns
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy "nl_recipients_all" on newsletter_recipients
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy "nl_unsub_all" on newsletter_unsubscribes
  for all using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
-- Hinweis: Tracking-/Abmelde-Endpunkte laufen über den Service-Role-Client
-- (umgeht RLS) und sind daher öffentlich per Token nutzbar.
