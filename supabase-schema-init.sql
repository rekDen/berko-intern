-- ============================================================
-- Berko AI – Hausverwaltung / CRM SaaS
-- Vollständiges Datenbankschema (Supabase / Postgres 15+)
-- Konsolidiert aus supabase-schema.sql + allen scripts/migration-*.sql,
-- abgeglichen gegen die LIVE-Datenbank (PostgREST OpenAPI-Introspektion,
-- 2026-09-08). Ersetzt supabase-schema.sql als Referenz für Refactoring.
--
-- WICHTIG — zwei Tabellengruppen existieren NUR als Migrationsdatei,
-- NICHT in der Produktions-DB (direkt per REST verifiziert, HTTP 404),
-- obwohl der App-Code sie referenziert:
--   - newsletter_campaigns / newsletter_recipients / newsletter_unsubscribes
--     (src/lib/newsletter.ts, src/app/api/newsletter/**)
--   - google_calendar_connections, deadlines.google_event_id
--     (src/lib/google/calendar.ts, src/app/api/google-calendar/**)
-- Diese Features sind in Produktion aktuell nicht funktionsfähig.
-- Sie sind hier enthalten (Abschnitte 33–34), damit dieses Skript eine
-- vollständige, lauffähige DB für den refaktorierten Code aufbaut — vor
-- dem produktiven Einsatz prüfen, ob sie tatsächlich (nach-)migriert
-- werden sollen.
--
-- Idempotent (safe re-run via DROP IF EXISTS).
-- ============================================================

-- ============================================================
-- 0a. CLEANUP
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop function if exists user_has_role_on cascade;
drop function if exists user_can_see_document cascade;
drop function if exists get_visible_categories cascade;
drop function if exists search_documents cascade;
drop function if exists mass_delete_batch cascade;
drop function if exists handover_property cascade;
drop function if exists log_sensitive_access cascade;
drop function if exists log_audit cascade;
drop function if exists current_tenant_id cascade;
drop function if exists is_tenant_admin cascade;
drop function if exists set_updated_at cascade;

drop view if exists v_contact_overview cascade;
drop view if exists v_active_tenants cascade;
drop view if exists v_active_owners cascade;
drop view if exists v_training_data cascade;

drop table if exists newsletter_unsubscribes cascade;
drop table if exists newsletter_recipients cascade;
drop table if exists newsletter_campaigns cascade;
drop table if exists google_calendar_connections cascade;
drop table if exists bug_features cascade;
drop table if exists sales_targets cascade;
drop table if exists activities cascade;
drop table if exists email_classification cascade;
drop table if exists document_access_log cascade;
drop table if exists document_shares cascade;
drop table if exists document_handovers cascade;
drop table if exists documents cascade;
drop table if exists document_batches cascade;
drop table if exists document_markers cascade;
drop table if exists document_categories cascade;
drop table if exists email_accounts cascade;
drop table if exists chat_messages cascade;
drop table if exists dictations cascade;
drop table if exists deadlines cascade;
drop table if exists emails cascade;
drop table if exists communications cascade;
drop table if exists tickets cascade;
drop table if exists bank_accounts cascade;
drop table if exists contracts cascade;
drop table if exists contact_roles cascade;
drop table if exists units cascade;
drop table if exists properties cascade;
drop table if exists contacts cascade;
drop table if exists audit_log cascade;
drop table if exists profiles cascade;
drop table if exists tenants cascade;

-- ============================================================
-- 0b. EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- 0c. CLASSIFICATION ENUMS
-- ============================================================
do $$ begin create type intent_label as enum (
  'inquiry','pricing_question','technical_question','legal_question',
  'objection','meeting_request','confirmation','rejection',
  'ghosting_breaker','internal','spam_noise'
); exception when duplicate_object then null; end $$;

do $$ begin create type sentiment_label as enum (
  'positive','neutral','skeptical','negative'
); exception when duplicate_object then null; end $$;

do $$ begin create type funnel_stage as enum (
  'top_of_funnel','mid_funnel','bottom_funnel','post_sale'
); exception when duplicate_object then null; end $$;

do $$ begin create type stakeholder_role as enum (
  'decision_maker','influencer','technical_evaluator','legal_evaluator',
  'procurement','user','blocker','unknown'
); exception when duplicate_object then null; end $$;

do $$ begin create type ai_use_case as enum (
  'voice_agent','chatbot_support','document_ai','workflow_automation',
  'custom_llm','data_analytics_rag','ai_consulting','unknown'
); exception when duplicate_object then null; end $$;

do $$ begin create type industry_vertical as enum (
  'property_management','construction_trades','legal','healthcare',
  'ecommerce_retail','financial_services','other'
); exception when duplicate_object then null; end $$;

-- ============================================================
-- 1. FOUNDATION – Tenants & Profiles
-- ============================================================

create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  settings   jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table profiles (
  id         uuid references auth.users on delete cascade primary key,
  tenant_id  uuid references tenants(id),
  role       text not null default 'tenant_user'
               check (role in ('tenant_admin', 'tenant_user', 'external')),
  name       text not null,
  title      text,
  initials   text,
  firm_name  text,
  language   text not null default 'de' check (language in ('de', 'en', 'ru')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  ical_token uuid                                     -- Token für iCal-Feed (Fristen/Termine)
);

-- Auto-create profile after signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, initials)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), '');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 2. RLS HELPER FUNCTIONS
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function current_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from profiles where id = auth.uid();
$$;

create or replace function is_tenant_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select role in ('tenant_admin','tenant_user') from profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- 3. AUDIT LOG
-- ============================================================

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  user_id     uuid references auth.users(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb,
  ip_address  inet,
  user_agent  text,
  occurred_at timestamptz not null default now()
);

create index idx_audit_log_tenant_entity on audit_log(tenant_id, entity_type, entity_id);
create index idx_audit_log_occurred     on audit_log(occurred_at);

create or replace function log_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid default null,
  p_metadata    jsonb default null
) returns void language plpgsql security definer as $$
begin
  insert into audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
  values (current_tenant_id(), auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

create or replace function log_sensitive_access(p_field text, p_contact_id uuid)
returns void language plpgsql security definer as $$
begin
  perform log_audit('view_sensitive', 'contact', p_contact_id,
    jsonb_build_object('field', p_field));
end;
$$;

-- ============================================================
-- 4. CRM – Contacts
-- Enthält website/category/contact_persons/availability/lead_source
-- (migration-contact-website/category/persons/availability/lead-source)
-- ============================================================

create table contacts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id),
  user_id        uuid references auth.users(id),
  owner_id       uuid references auth.users(id),
  type           text not null default 'natural_person'
                   check (type in ('natural_person','legal_entity')),
  salutation     text check (salutation in ('herr','frau','firma','eheleute','none')),
  academic_title text,
  first_name     text,
  last_name      text,
  company_name   text,
  date_of_birth  date,
  nationality    text,
  language       text default 'de' check (language in ('de','en','ru')),
  emails         jsonb not null default '[]',
  phones         jsonb not null default '[]',
  addresses      jsonb not null default '[]',
  tax_id         text,
  vat_id         text,
  gwg_data       jsonb,
  gdpr_consents  jsonb not null default '[]',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  deleted_at     timestamptz,
  website        text,
  category       text,
  contact_persons jsonb not null default '[]',   -- Ansprechpartner bei juristischen Personen
  availability   text,                            -- Erreichbarkeit
  lead_source    text
);

create index idx_contacts_tenant      on contacts(tenant_id);
create index idx_contacts_tenant_name on contacts(tenant_id, last_name, first_name);
create index idx_contacts_user        on contacts(user_id) where user_id is not null;
create index idx_contacts_owner       on contacts(owner_id) where owner_id is not null;

-- ============================================================
-- 5. CRM – Properties (Liegenschaften)
-- Enthält alle Felder aus migration-properties-stammdaten +
-- migration-properties-managed-since
-- ============================================================

create table properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  created_by uuid references auth.users(id),

  -- Identifikation
  name        text not null,
  type        text not null default 'weg'
                check (type in ('weg','miethaus','sondereigentum','gewerbe','mixed')),
  usage_type  text check (usage_type is null or usage_type in ('residential','commercial','mixed')),
  is_weg      boolean,

  -- Adresse
  street               text,
  house_number         text,
  zip_code             text,
  city                 text,
  state                text,
  country              text default 'DE',
  location_description text,

  -- Grundbuch
  gemarkung            text,
  flur                 text,
  flurstueck           text,
  land_register_volume text,
  land_register_sheet  text,

  -- Baujahr & Renovierung
  year_built              int,
  last_renovation_year    int,
  last_renovation_notes   text,
  managed_since           date,

  -- Flächen & Größen
  total_area    numeric(10,2),
  living_area   numeric(10,2),
  usable_area   numeric(10,2),
  plot_area     numeric(10,2),
  unit_count    int,
  room_count    numeric(4,1),
  bathroom_count int,
  floor          text,

  -- Technische Ausstattung
  heating_type         text,
  energy_class         text,
  energy_certificate   jsonb,
  has_elevator         boolean,
  parking_spaces       int,
  has_balcony          boolean,
  has_terrace          boolean,
  is_furnished         boolean,

  -- Miet- & Nutzungsdaten
  rental_status              text check (rental_status is null or rental_status in ('free','rented','airbnb','mixed')),
  short_term_rental_allowed  boolean,

  -- Kosten
  monthly_reserve           numeric(10,2),
  monthly_operating_costs   numeric(10,2),
  monthly_management_costs  numeric(10,2),

  -- Versicherungen (Array von { type, provider, policy_number, premium, expires_at })
  insurances jsonb not null default '[]',

  -- Rechtliche & behördliche Daten
  building_permit_info text,
  usage_change_info    text,
  misuse_status        text,
  is_monument          boolean,

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_properties_tenant on properties(tenant_id);

-- ============================================================
-- 6. CRM – Units (Einheiten)
-- ============================================================

create table units (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  property_id          uuid not null references properties(id),
  created_by           uuid references auth.users(id),
  unit_number          text not null,
  floor                text,
  location_description text,
  type                 text not null default 'apartment'
                         check (type in ('apartment','commercial','parking','storage','other')),
  area                 numeric(10,2),
  room_count           numeric(4,1),
  mea                  numeric(10,4),
  land_register_sheet  text,
  land_register_number text,
  heating_type         text,
  meter_numbers        jsonb not null default '[]',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index idx_units_tenant   on units(tenant_id);
create index idx_units_property on units(property_id);

-- ============================================================
-- 7. CRM – Contact Roles
-- ============================================================

create table contact_roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  contact_id  uuid not null references contacts(id),
  property_id uuid references properties(id),
  unit_id     uuid references units(id),
  contract_id uuid,                       -- FK added after contracts table
  role        text not null
                check (role in ('owner','tenant','subtenant','beirat','proxy',
                                'service_provider','caretaker','other')),
  valid_from  date not null default current_date,
  valid_to    date,
  is_primary  boolean not null default true,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  deleted_at  timestamptz
);

create index idx_contact_roles_tenant   on contact_roles(tenant_id);
create index idx_contact_roles_contact  on contact_roles(contact_id);
create index idx_contact_roles_property on contact_roles(property_id);
create index idx_contact_roles_unit     on contact_roles(unit_id);

-- ============================================================
-- 7a. RLS HELPER – user_has_role_on
-- ============================================================

create or replace function user_has_role_on(
  p_property_id   uuid default null,
  p_unit_id       uuid default null,
  p_contract_id   uuid default null,
  p_required_roles text[] default null
) returns boolean language sql stable security definer as $$
  select exists (
    select 1 from contact_roles cr
    join contacts c on c.id = cr.contact_id
    where c.user_id = auth.uid()
      and cr.deleted_at is null
      and (cr.valid_to is null or cr.valid_to > now())
      and (p_property_id is null
           or cr.property_id = p_property_id
           or cr.unit_id in (select id from units where property_id = p_property_id))
      and (p_unit_id is null or cr.unit_id = p_unit_id)
      and (p_contract_id is null or cr.contract_id = p_contract_id)
      and (p_required_roles is null or cr.role = any(p_required_roles))
  );
$$;

-- ============================================================
-- 8. CRM – Contracts (Deals)
-- WICHTIG: Diese Tabelle wurde per migration-deals-schema.sql von einem
-- Mietvertrags-/Verwaltungsvertrags-Modell (start_date, cold_rent, hausgeld,
-- contact_role_id, …) zu einem generischen CRM-Deal-Modell umgebaut
-- (title, amount, probability, contact_id direkt, forecast_category, …).
-- Enthält außerdem contract_data (migration-contract-data, freies JSONB für
-- Vertragsvorlagen-Formulardaten).
-- ============================================================

create table contracts (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  created_by           uuid references auth.users(id),
  owner_id             uuid references auth.users(id),
  contact_id           uuid references contacts(id),
  referral_contact_id  uuid references contacts(id),
  deal_status          text not null default 'lead'
                         check (deal_status in ('lead','contacted','on_hold','qualified',
                                                'disqualified','demo','proposal',
                                                'negotiation','won','lost')),
  title                text,
  description          text,
  amount               numeric(12,2),
  currency             text not null default 'EUR',
  probability          smallint check (probability is null or (probability >= 0 and probability <= 100)),
  expected_close_date  date,
  actual_close_date    date,
  source               text,
  source_campaign      text,
  lost_to_competitor   text,
  lost_reason          text,
  lost_notes           text,
  priority             text check (priority is null or priority in ('low','medium','high','urgent')),
  forecast_category    text,
  contract_data        jsonb,               -- Freiformdaten aus Vertragsvorlage
  last_activity_at     timestamptz,
  next_activity_at     timestamptz,
  qualified_at         timestamptz,
  demo_booked_at       timestamptz,
  won_at               timestamptz,
  lost_at              timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

-- Back-reference: contact_roles.contract_id → contracts.id
alter table contact_roles
  add constraint fk_contact_roles_contract
  foreign key (contract_id) references contracts(id);

create index idx_contracts_tenant  on contracts(tenant_id);
create index idx_contracts_owner   on contracts(owner_id) where owner_id is not null;
create index idx_contracts_contact on contracts(contact_id) where contact_id is not null;

-- ============================================================
-- 9. CRM – Bank Accounts
-- ============================================================

create table bank_accounts (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id),
  contact_id              uuid not null references contacts(id),
  created_by              uuid references auth.users(id),
  iban                    text not null,
  bic                     text,
  account_holder          text not null,
  sepa_mandate_reference  text,
  sepa_mandate_date       date,
  sepa_mandate_status     text check (sepa_mandate_status in ('active','inactive','revoked')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create index idx_bank_accounts_tenant  on bank_accounts(tenant_id);
create index idx_bank_accounts_contact on bank_accounts(contact_id);

-- ============================================================
-- 10. CRM – Tickets
-- ============================================================

create table tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  contact_id  uuid references contacts(id),
  unit_id     uuid references units(id),
  property_id uuid references properties(id),
  created_by  uuid references auth.users(id),
  assignee_id uuid references profiles(id),
  title       text not null,
  description text,
  category    text,
  status      text not null default 'new'
                check (status in ('new','in_progress','waiting','resolved','closed')),
  priority    text not null default 'normal'
                check (priority in ('low','normal','high','urgent')),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index idx_tickets_tenant        on tickets(tenant_id);
create index idx_tickets_tenant_status on tickets(tenant_id, status);

-- ============================================================
-- 11. CRM – Communications
-- Enthält property_id/unit_id (migration-communications-property),
-- erweiterten channel-Enum (migration-communications) sowie
-- duration_minutes/duration_seconds/gatekeeper_bypassed/call_status/
-- call_result/follow_up/sentiment/contact_person (migration-communications-*)
-- ============================================================

create table communications (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id),
  contact_id           uuid references contacts(id),          -- nullable (Notizen ohne Kontakt)
  ticket_id            uuid references tickets(id),
  property_id          uuid references properties(id),
  unit_id              uuid references units(id),
  created_by           uuid references auth.users(id),
  channel              text not null
                         check (channel in ('email','phone','letter','meeting','online_meeting','portal','note')),
  direction            text not null
                         check (direction in ('inbound','outbound')),
  subject              text,
  body                 text,
  attachments          jsonb not null default '[]',
  contact_person       text,                -- gewählter Ansprechpartner bei juristischen Personen
  duration_minutes     int check (duration_minutes is null or duration_minutes >= 0),
  duration_seconds     int check (duration_seconds is null or duration_seconds >= 0),
  gatekeeper_bypassed  text,                -- 'ja' | 'nein'
  call_status          text,
  call_result          text,
  follow_up            text,
  sentiment            text,
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index idx_communications_tenant   on communications(tenant_id);
create index idx_communications_contact  on communications(contact_id);
create index idx_communications_ticket   on communications(ticket_id) where ticket_id is not null;
create index idx_communications_property on communications(property_id) where property_id is not null;
create index idx_communications_unit     on communications(unit_id) where unit_id is not null;

-- ============================================================
-- 12. CRM – Views
-- ============================================================

create or replace view v_active_owners as
select cr.id as role_id, cr.tenant_id, cr.contact_id, cr.unit_id, cr.property_id,
       c.first_name, c.last_name, c.company_name,
       u.unit_number, cr.valid_from, cr.valid_to, cr.is_primary, cr.metadata
from contact_roles cr
join contacts c on c.id = cr.contact_id
left join units u on u.id = cr.unit_id
where cr.role = 'owner' and cr.deleted_at is null and c.deleted_at is null
  and (cr.valid_to is null or cr.valid_to > current_date);

create or replace view v_active_tenants as
select cr.id as role_id, cr.tenant_id, cr.contact_id, cr.unit_id, cr.property_id,
       c.first_name, c.last_name, c.company_name,
       u.unit_number, cr.valid_from, cr.valid_to, cr.is_primary, cr.metadata
from contact_roles cr
join contacts c on c.id = cr.contact_id
left join units u on u.id = cr.unit_id
where cr.role = 'tenant' and cr.deleted_at is null and c.deleted_at is null
  and (cr.valid_to is null or cr.valid_to > current_date);

create or replace view v_contact_overview as
select c.id, c.tenant_id, c.type, c.first_name, c.last_name, c.company_name,
       c.emails, c.phones,
       array_agg(distinct cr.role) filter (where cr.role is not null) as active_roles,
       array_agg(distinct p.name)  filter (where p.name is not null)  as property_names
from contacts c
left join contact_roles cr on cr.contact_id = c.id
  and cr.deleted_at is null and (cr.valid_to is null or cr.valid_to > current_date)
left join properties p on p.id = cr.property_id and p.deleted_at is null
where c.deleted_at is null
group by c.id;

-- ============================================================
-- 13. APP – Emails
-- Enthält linked_*-Spalten (migration-email-links) und attachments
-- (migration-emails-attachments). HINWEIS: category/ai_categorized aus
-- migration-email-categories.sql existieren NICHT in Produktion und
-- werden im App-Code nicht verwendet — bewusst weggelassen.
-- ============================================================

create table emails (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  created_by          uuid references auth.users(id),
  from_address        text not null,
  from_name           text not null,
  subject             text not null,
  body                text not null,
  date                timestamptz not null default now(),
  read                boolean not null default false,
  starred             boolean not null default false,
  ai_summary          text default '',
  ai_draft            text default '',
  ai_legal            text default '',
  imap_uid            bigint,
  message_id          text,
  folder              text not null default 'inbox'
                        check (folder in ('inbox','sent','draft')),
  to_address          text,
  cc                  text,
  bcc                 text,
  attachments         jsonb not null default '[]',
  -- Entity links (migration-email-links)
  linked_contact_id   uuid references contacts(id),
  linked_property_id  uuid references properties(id),
  linked_ticket_id    uuid references tickets(id),
  linked_contract_id  uuid references contracts(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index idx_emails_tenant          on emails(tenant_id);
create index idx_emails_tenant_folder   on emails(tenant_id, folder);
-- imap_uid ist pro Postfach (created_by) eindeutig, nicht pro Tenant
-- (migration-emails-imap-uid-index: mehrere Postfächer je Tenant hätten
-- sonst kollidierende UIDs verursacht und Importe blockiert).
create unique index idx_emails_imap_uid on emails(created_by, imap_uid) where imap_uid is not null;
create index idx_emails_message_id      on emails(tenant_id, message_id) where message_id is not null;
create index idx_emails_linked_contact  on emails(linked_contact_id) where linked_contact_id is not null;
create index idx_emails_linked_property on emails(linked_property_id) where linked_property_id is not null;
create index idx_emails_linked_ticket   on emails(linked_ticket_id) where linked_ticket_id is not null;
create index idx_emails_linked_contract on emails(linked_contract_id) where linked_contract_id is not null;

-- ============================================================
-- 13b. EMAIL CLASSIFICATION
-- ============================================================

create table email_classification (
  id                      uuid primary key default gen_random_uuid(),
  email_id                uuid not null references emails(id) on delete cascade unique,
  tenant_id               uuid not null references tenants(id),
  contract_id             uuid references contracts(id) on delete set null,

  -- AI prediction (immutable)
  ai_intent               intent_label,
  ai_sentiment            sentiment_label,
  ai_funnel_stage         funnel_stage,
  ai_stakeholder_role     stakeholder_role,
  ai_confidence           numeric(3,2) check (ai_confidence between 0 and 1),
  ai_model_version        text not null default '',
  ai_classified_at        timestamptz default now(),
  ai_reasoning            text,

  -- Human correction (null until corrected)
  human_intent            intent_label,
  human_sentiment         sentiment_label,
  human_funnel_stage      funnel_stage,
  human_stakeholder_role  stakeholder_role,
  corrected_at            timestamptz,
  corrected_by            uuid references auth.users(id),
  correction_note         text,

  -- Extracted entities
  detected_use_case       ai_use_case,
  detected_industry       industry_vertical,
  mentioned_competitors   text[] default '{}',
  deal_size_signal        text,
  timeline_signal         text,
  concerns                text[] default '{}',
  mentioned_amounts       numeric[] default '{}',

  -- Behavioral
  response_time_hours     int,

  -- Outcome (propagated when contract is won/lost)
  final_outcome           text check (final_outcome in ('won','lost','no_response','pending')),
  outcome_propagated_at   timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_email_classification_tenant   on email_classification(tenant_id);
create index idx_email_classification_email_id on email_classification(email_id);
create index idx_email_classification_outcome  on email_classification(final_outcome) where final_outcome is not null;

-- ============================================================
-- 14. APP – Deadlines (Fristen & Termine)
-- Enthält property_id/unit_id (migration-deadlines-property),
-- contact_id (migration-deadlines-contact), time (migration-deadlines-time),
-- invite_emails (migration-deadlines-invites). az ist optional
-- (migration-deadlines-az-optional).
-- ============================================================

create table deadlines (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  created_by    uuid references auth.users(id),
  property_id   uuid references properties(id),
  unit_id       uuid references units(id),
  contact_id    uuid references contacts(id),
  az            text default '',
  date          date not null,
  time          text,
  title         text not null,
  description   text default '',
  type          text not null check (type in ('frist','termin')),
  completed     boolean not null default false,
  assigned_to   text default '',
  location      text default '',
  invite_emails jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index idx_deadlines_tenant      on deadlines(tenant_id);
create index idx_deadlines_tenant_date on deadlines(tenant_id, date);
create index idx_deadlines_property    on deadlines(property_id) where property_id is not null;
create index idx_deadlines_unit        on deadlines(unit_id) where unit_id is not null;
create index idx_deadlines_contact     on deadlines(contact_id) where contact_id is not null;

-- ============================================================
-- 15. APP – Dictations
-- Enthält linked_*-Spalten (migration-dictation-links)
-- ============================================================

create table dictations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  created_by          uuid references auth.users(id),
  title               text default '',
  raw_transcription   text not null,
  formatted_text      text not null,
  duration_seconds    int,
  linked_contact_id   uuid references contacts(id),
  linked_property_id  uuid references properties(id),
  linked_ticket_id    uuid references tickets(id),
  linked_contract_id  uuid references contracts(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index idx_dictations_tenant on dictations(tenant_id);

-- ============================================================
-- 16. APP – Chat Messages (KI)
-- ============================================================

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  created_by uuid references auth.users(id),
  role       text not null check (role in ('user','assistant','system')),
  content    text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_chat_messages_tenant on chat_messages(tenant_id);

-- ============================================================
-- 17. APP – Email Accounts (IMAP)
-- ============================================================

create table email_accounts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  user_id      uuid not null references profiles(id) unique,
  email        text not null,
  imap_host    text not null default 'imap.ionos.de',
  imap_port    int  not null default 993,
  imap_user    text not null,
  imap_password text not null,
  deleted_uids jsonb not null default '[]',
  last_sync_at timestamptz,
  sync_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index idx_email_accounts_tenant on email_accounts(tenant_id);

-- ============================================================
-- 18. DMS – Document Categories (System-Taxonomie, read-only)
-- Basisdaten + erweiterte Taxonomie werden separat eingespielt, siehe
-- scripts/seed-document-categories.ts und scripts/migration-categories-expand.sql
-- ============================================================

create table document_categories (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid references document_categories(id),
  code                text not null unique,
  group_code          text not null,
  name_de             text not null,
  name_en             text not null,
  name_ru             text not null,
  level               text not null check (level in ('property','unit','contract')),
  allowed_roles       text[] not null default '{}',
  supports_fiscal_year boolean not null default false,
  search_synonyms     text[] not null default '{}',
  sort_order          int not null default 0
);

create index idx_document_categories_parent   on document_categories(parent_id);
create index idx_document_categories_group    on document_categories(group_code);
create index idx_document_categories_synonyms on document_categories using gin(search_synonyms);

-- ============================================================
-- 19. DMS – Document Markers
-- ============================================================

create table document_markers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  category_id uuid not null references document_categories(id),
  created_by  uuid references auth.users(id),
  name        text not null,
  color       text,
  created_at  timestamptz not null default now()
);

create index idx_document_markers_tenant_cat on document_markers(tenant_id, category_id);

-- ============================================================
-- 20. DMS – Document Batches
-- ============================================================

create table document_batches (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  created_by        uuid references auth.users(id),
  name              text not null,
  description       text,
  batch_type        text not null
                      check (batch_type in ('mass_upload','mailing','handover')),
  target_category_id uuid references document_categories(id),
  target_level       text check (target_level in ('property','unit','contract')),
  status             text not null default 'draft'
                       check (status in ('draft','processing','completed','partially_failed')),
  created_at         timestamptz not null default now()
);

create index idx_document_batches_tenant on document_batches(tenant_id);

-- ============================================================
-- 21. DMS – Documents
-- ============================================================

create table documents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  category_id         uuid not null references document_categories(id),
  created_by          uuid references auth.users(id),
  uploaded_by         uuid references auth.users(id),
  deleted_by          uuid references auth.users(id),
  level               text not null check (level in ('property','unit','contract')),
  property_id         uuid references properties(id),
  unit_id             uuid references units(id),
  contract_id         uuid references contracts(id),
  batch_id            uuid references document_batches(id),
  title               text not null,
  description         text,
  storage_path        text not null,
  file_name           text not null,
  file_size           bigint,
  mime_type           text,
  file_hash           text,
  fiscal_year         int,
  markers             uuid[] not null default '{}',
  visibility_override jsonb,
  internal_only       boolean not null default false,
  uploaded_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index idx_documents_tenant_property_cat on documents(tenant_id, property_id, category_id);
create index idx_documents_tenant_contract     on documents(tenant_id, contract_id);
create index idx_documents_tenant_unit         on documents(tenant_id, unit_id);
create index idx_documents_batch               on documents(batch_id) where batch_id is not null;
create index idx_documents_hash                on documents(file_hash) where file_hash is not null;

-- ============================================================
-- 22. DMS – Document Access Log
-- ============================================================

create table document_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  user_id     uuid references auth.users(id),
  contact_id  uuid references contacts(id),
  action      text not null check (action in ('view','download','preview')),
  ip_address  inet,
  user_agent  text,
  occurred_at timestamptz not null default now()
);

create index idx_doc_access_log_document on document_access_log(document_id);

-- ============================================================
-- 23. DMS – Document Handovers (Verwalterübergabe)
-- ============================================================

create table document_handovers (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id),
  from_tenant_id uuid not null references tenants(id),
  to_tenant_id   uuid not null references tenants(id),
  requested_by   uuid references auth.users(id),
  approved_by    uuid references auth.users(id),
  status         text not null default 'requested'
                   check (status in ('requested','approved','completed','cancelled')),
  snapshot       jsonb,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_document_handovers_property on document_handovers(property_id);

-- ============================================================
-- 24. DMS – Document Shares
-- ============================================================

create table document_shares (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id),
  created_by    uuid references auth.users(id),
  token         text not null unique,
  expires_at    timestamptz not null,
  password_hash text,
  access_count  int not null default 0,
  max_access    int,
  created_at    timestamptz not null default now()
);

create index idx_document_shares_token on document_shares(token);

-- ============================================================
-- 25. ACTIVITIES – Logging all touchpoints on contacts and deals
-- ============================================================

create table activities (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  user_id       uuid not null references auth.users(id),
  entity_type   text not null check (entity_type in ('contact','deal')),
  entity_id     uuid not null,
  type          text not null check (type in (
                  'call','email','meeting','note','task',
                  'stage_change','demo_booked','demo_happened',
                  'proposal_sent','contract_sent','trial_started','other')),
  title         text,
  description   text,
  metadata      jsonb not null default '{}',
  performed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index idx_activities_tenant      on activities(tenant_id);
create index idx_activities_entity      on activities(tenant_id, entity_type, entity_id);
create index idx_activities_user        on activities(tenant_id, user_id);
create index idx_activities_performed   on activities(tenant_id, performed_at desc);

-- ============================================================
-- 26. SALES_TARGETS – Per-user, per-period quota settings
-- ============================================================

create table sales_targets (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id),
  user_id                   uuid not null references auth.users(id),
  period_type               text not null check (period_type in ('weekly','monthly','quarterly')),
  period_start              date not null,
  target_qualified_leads    int,
  target_demo_bookings      int,
  target_demo_show_ups      int,
  target_new_customers      int,
  target_revenue_eur        numeric(10,2),
  target_mrr_eur            numeric(10,2),
  target_win_rate           numeric(5,2),
  cac_eur                   numeric(10,2),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique(tenant_id, user_id, period_type, period_start)
);

create index idx_sales_targets_tenant on sales_targets(tenant_id);
create index idx_sales_targets_user   on sales_targets(tenant_id, user_id);

-- ============================================================
-- 27. BUG_FEATURES – internal bug/feature tracker
-- Storage-Bucket "bug-features" (public) wird in Abschnitt 32 angelegt.
-- ============================================================

create table bug_features (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  created_by  uuid references auth.users(id),
  title       text not null,
  description text,
  type        text not null default 'feature' check (type in ('bug', 'feature')),
  status      text not null default 'backlog'
              check (status in ('backlog', 'on_hold', 'in_progress', 'review', 'done', 'rejected')),
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 28. TRIGGERS – updated_at
-- ============================================================

create trigger trg_tenants_updated_at              before update on tenants              for each row execute function set_updated_at();
create trigger trg_profiles_updated_at             before update on profiles             for each row execute function set_updated_at();
create trigger trg_contacts_updated_at             before update on contacts             for each row execute function set_updated_at();
create trigger trg_properties_updated_at           before update on properties           for each row execute function set_updated_at();
create trigger trg_units_updated_at                before update on units                for each row execute function set_updated_at();
create trigger trg_contact_roles_updated_at        before update on contact_roles        for each row execute function set_updated_at();
create trigger trg_contracts_updated_at            before update on contracts            for each row execute function set_updated_at();
create trigger trg_bank_accounts_updated_at        before update on bank_accounts        for each row execute function set_updated_at();
create trigger trg_tickets_updated_at              before update on tickets              for each row execute function set_updated_at();
create trigger trg_communications_updated_at       before update on communications       for each row execute function set_updated_at();
create trigger trg_emails_updated_at               before update on emails               for each row execute function set_updated_at();
create trigger trg_deadlines_updated_at            before update on deadlines            for each row execute function set_updated_at();
create trigger trg_dictations_updated_at           before update on dictations           for each row execute function set_updated_at();
create trigger trg_chat_messages_updated_at        before update on chat_messages        for each row execute function set_updated_at();
create trigger trg_email_accounts_updated_at       before update on email_accounts       for each row execute function set_updated_at();
create trigger trg_documents_updated_at            before update on documents            for each row execute function set_updated_at();
create trigger trg_document_handovers_updated_at   before update on document_handovers   for each row execute function set_updated_at();
create trigger trg_email_classification_updated_at before update on email_classification for each row execute function set_updated_at();
create trigger trg_bug_features_updated_at         before update on bug_features         for each row execute function set_updated_at();

-- ============================================================
-- 29. RLS POLICIES
-- ============================================================

-- ACTIVITIES
alter table activities enable row level security;
create policy "activities_select_tenant" on activities for select using (tenant_id = current_tenant_id());
create policy "activities_insert_tenant" on activities for insert with check (tenant_id = current_tenant_id());
create policy "activities_update_tenant" on activities for update using (tenant_id = current_tenant_id());

-- SALES_TARGETS
alter table sales_targets enable row level security;
create policy "sales_targets_select_tenant" on sales_targets for select using (tenant_id = current_tenant_id());
create policy "sales_targets_insert_tenant" on sales_targets for insert with check (tenant_id = current_tenant_id());
create policy "sales_targets_update_tenant" on sales_targets for update using (tenant_id = current_tenant_id());

-- TENANTS
alter table tenants enable row level security;
create policy "tenants_select" on tenants for select using (id = current_tenant_id());

-- PROFILES
alter table profiles enable row level security;
create policy "profiles_insert_own"    on profiles for insert with check (id = auth.uid());
create policy "profiles_select_own"    on profiles for select using (id = auth.uid());
create policy "profiles_select_tenant" on profiles for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "profiles_update_own"    on profiles for update using (id = auth.uid());

-- CONTACTS
alter table contacts enable row level security;
create policy "contacts_select_tenant" on contacts for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "contacts_insert_tenant" on contacts for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "contacts_update_tenant" on contacts for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- PROPERTIES
alter table properties enable row level security;
create policy "properties_select_tenant"   on properties for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "properties_select_external" on properties for select using (user_has_role_on(p_property_id := id) and deleted_at is null);
create policy "properties_insert_tenant"   on properties for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "properties_update_tenant"   on properties for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- UNITS
alter table units enable row level security;
create policy "units_select_tenant"   on units for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "units_select_external" on units for select using (user_has_role_on(p_unit_id := id) and deleted_at is null);
create policy "units_insert_tenant"   on units for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "units_update_tenant"   on units for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- CONTACT_ROLES
alter table contact_roles enable row level security;
create policy "contact_roles_select_tenant" on contact_roles for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "contact_roles_insert_tenant" on contact_roles for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "contact_roles_update_tenant" on contact_roles for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- CONTRACTS
alter table contracts enable row level security;
create policy "contracts_select_tenant" on contracts for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "contracts_insert_tenant" on contracts for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "contracts_update_tenant" on contracts for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- BANK_ACCOUNTS
alter table bank_accounts enable row level security;
create policy "bank_accounts_select_tenant" on bank_accounts for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "bank_accounts_insert_tenant" on bank_accounts for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "bank_accounts_update_tenant" on bank_accounts for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- TICKETS
alter table tickets enable row level security;
create policy "tickets_select_tenant" on tickets for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "tickets_insert_tenant" on tickets for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "tickets_update_tenant" on tickets for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- COMMUNICATIONS (migration-communications-rls: update/delete auf tenant admin beschränkt)
alter table communications enable row level security;
create policy "communications_select_tenant" on communications for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "communications_insert_tenant" on communications for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "communications_update_tenant" on communications for update using (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "communications_delete_tenant" on communications for delete using (tenant_id = current_tenant_id() and is_tenant_admin());

-- EMAILS
alter table emails enable row level security;
create policy "emails_select_tenant" on emails for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "emails_insert_tenant" on emails for insert with check (tenant_id = current_tenant_id());
create policy "emails_update_tenant" on emails for update using (tenant_id = current_tenant_id());

-- EMAIL_CLASSIFICATION
alter table email_classification enable row level security;
create policy "email_classification_select" on email_classification for select using (tenant_id = current_tenant_id());
create policy "email_classification_insert" on email_classification for insert with check (tenant_id = current_tenant_id());
create policy "email_classification_update" on email_classification for update using (tenant_id = current_tenant_id());

-- DEADLINES
alter table deadlines enable row level security;
create policy "deadlines_select_tenant" on deadlines for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "deadlines_insert_tenant" on deadlines for insert with check (tenant_id = current_tenant_id());
create policy "deadlines_update_tenant" on deadlines for update using (tenant_id = current_tenant_id());

-- DICTATIONS
alter table dictations enable row level security;
create policy "dictations_select_tenant" on dictations for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "dictations_insert_tenant" on dictations for insert with check (tenant_id = current_tenant_id());

-- CHAT_MESSAGES
alter table chat_messages enable row level security;
create policy "chat_messages_select_tenant" on chat_messages for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "chat_messages_insert_tenant" on chat_messages for insert with check (tenant_id = current_tenant_id());

-- EMAIL_ACCOUNTS
alter table email_accounts enable row level security;
create policy "email_accounts_select_own" on email_accounts for select using (user_id = auth.uid() and deleted_at is null);
create policy "email_accounts_insert_own" on email_accounts for insert with check (user_id = auth.uid() and tenant_id = current_tenant_id());
create policy "email_accounts_update_own" on email_accounts for update using (user_id = auth.uid());

-- DOCUMENT_CATEGORIES (read-only, everyone)
alter table document_categories enable row level security;
create policy "document_categories_select_all" on document_categories for select using (true);

-- DOCUMENT_MARKERS
alter table document_markers enable row level security;
create policy "document_markers_select_tenant" on document_markers for select using (tenant_id = current_tenant_id());
create policy "document_markers_insert_tenant" on document_markers for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());

-- DOCUMENT_BATCHES
alter table document_batches enable row level security;
create policy "document_batches_select_tenant" on document_batches for select using (tenant_id = current_tenant_id());
create policy "document_batches_insert_tenant" on document_batches for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());

-- DOCUMENTS
alter table documents enable row level security;
create policy "documents_select_tenant"   on documents for select using (tenant_id = current_tenant_id() and deleted_at is null);
create policy "documents_select_external" on documents for select using (
  deleted_at is null and internal_only = false and (
    (level = 'property'  and user_has_role_on(p_property_id := property_id))
    or (level = 'unit'   and user_has_role_on(p_unit_id := unit_id))
    or (level = 'contract' and user_has_role_on(p_contract_id := contract_id))
  ));
create policy "documents_insert_tenant" on documents for insert with check (tenant_id = current_tenant_id() and is_tenant_admin());
create policy "documents_update_tenant" on documents for update using (tenant_id = current_tenant_id() and is_tenant_admin());

-- DOCUMENT_HANDOVERS
alter table document_handovers enable row level security;
create policy "document_handovers_select" on document_handovers for select using (
  from_tenant_id = current_tenant_id() or to_tenant_id = current_tenant_id());

-- DOCUMENT_SHARES
alter table document_shares enable row level security;
create policy "document_shares_select_tenant" on document_shares for select using (
  exists (select 1 from documents d where d.id = document_shares.document_id and d.tenant_id = current_tenant_id()));

-- AUDIT_LOG
alter table audit_log enable row level security;
create policy "audit_log_select_tenant" on audit_log for select using (tenant_id = current_tenant_id() and is_tenant_admin());

-- BUG_FEATURES
alter table bug_features enable row level security;
create policy "tenant members can manage bug_features"
  on bug_features for all
  using (tenant_id = (select tenant_id from profiles where id = auth.uid()));

-- ============================================================
-- 30. DMS – RPC Functions
-- ============================================================

create or replace function user_can_see_document(doc_id uuid)
returns boolean language plpgsql stable security definer as $$
declare
  v_doc documents%rowtype;
  v_cat document_categories%rowtype;
begin
  select * into v_doc from documents where id = doc_id and deleted_at is null;
  if not found then return false; end if;
  if v_doc.tenant_id = current_tenant_id() and is_tenant_admin() then return true; end if;
  if v_doc.internal_only then return false; end if;
  select * into v_cat from document_categories where id = v_doc.category_id;
  if    v_doc.level = 'property'  then return user_has_role_on(p_property_id  := v_doc.property_id,  p_required_roles := v_cat.allowed_roles);
  elsif v_doc.level = 'unit'      then return user_has_role_on(p_unit_id      := v_doc.unit_id,      p_required_roles := v_cat.allowed_roles);
  elsif v_doc.level = 'contract'  then return user_has_role_on(p_contract_id  := v_doc.contract_id,  p_required_roles := v_cat.allowed_roles);
  end if;
  return false;
end;
$$;

create or replace function get_visible_categories(p_property_id uuid)
returns table (category_id uuid, code text, group_code text, name_de text, name_en text, name_ru text, level text, doc_count bigint)
language plpgsql stable security definer as $$
begin
  return query
  select dc.id, dc.code, dc.group_code, dc.name_de, dc.name_en, dc.name_ru, dc.level,
         count(d.id) as doc_count
  from document_categories dc
  left join documents d on d.category_id = dc.id and d.deleted_at is null and d.property_id = p_property_id
  where dc.parent_id is not null
  group by dc.id order by dc.sort_order;
end;
$$;

create or replace function search_documents(p_query text, p_property_id uuid default null, p_limit int default 50)
returns setof documents language plpgsql stable security definer as $$
begin
  return query
  select d.* from documents d
  join document_categories dc on dc.id = d.category_id
  where d.deleted_at is null and d.tenant_id = current_tenant_id()
    and (p_property_id is null or d.property_id = p_property_id)
    and (d.title ilike '%' || p_query || '%'
         or d.description ilike '%' || p_query || '%'
         or p_query = any(dc.search_synonyms))
  order by d.uploaded_at desc limit p_limit;
end;
$$;

create or replace function mass_delete_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_count int; begin
  if not exists (select 1 from document_batches where id = p_batch_id and tenant_id = current_tenant_id()) then
    raise exception 'NOT_FOUND';
  end if;
  update documents set deleted_at = now(), deleted_by = auth.uid()
  where batch_id = p_batch_id and deleted_at is null;
  get diagnostics v_count = row_count;
  update document_batches set status = 'draft' where id = p_batch_id;
  perform log_audit('delete', 'document_batch', p_batch_id, jsonb_build_object('deleted_documents', v_count));
  return jsonb_build_object('deleted_documents', v_count);
end;
$$;

create or replace function handover_property(p_property_id uuid, p_to_tenant_id uuid)
returns uuid language plpgsql security definer as $$
declare v_handover_id uuid; v_doc_count int; v_unit_count int; begin
  if current_tenant_id() is null or not is_tenant_admin() then raise exception 'PERMISSION_DENIED'; end if;
  select count(*) into v_doc_count  from documents where property_id = p_property_id and tenant_id = current_tenant_id() and deleted_at is null;
  select count(*) into v_unit_count from units    where property_id = p_property_id and tenant_id = current_tenant_id() and deleted_at is null;
  insert into document_handovers (property_id, from_tenant_id, to_tenant_id, status, requested_by, snapshot)
  values (p_property_id, current_tenant_id(), p_to_tenant_id, 'requested', auth.uid(),
          jsonb_build_object('document_count', v_doc_count, 'unit_count', v_unit_count, 'created_at', now()))
  returning id into v_handover_id;
  perform log_audit('create', 'document_handover', v_handover_id,
    jsonb_build_object('property_id', p_property_id, 'to_tenant_id', p_to_tenant_id));
  return v_handover_id;
end;
$$;

-- ============================================================
-- 31. STORAGE – documents Bucket + RLS
-- Policies entsprechen dem aktuellen Produktionsstand
-- (migration-storage-policies, letzter Stand — ersetzt die engere
-- Pfad-Variante aus migration-storage-bucket).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_storage_select" on storage.objects;
drop policy if exists "documents_storage_insert" on storage.objects;
drop policy if exists "documents_storage_update" on storage.objects;
drop policy if exists "documents_storage_delete" on storage.objects;

create policy "documents_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and current_tenant_id() is not null);

create policy "documents_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and current_tenant_id() is not null);

create policy "documents_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and current_tenant_id() is not null);

create policy "documents_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and current_tenant_id() is not null);

-- ============================================================
-- 32. STORAGE – bug-features Bucket (public)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('bug-features', 'bug-features', true)
on conflict (id) do nothing;

-- ============================================================
-- 33. NEWSLETTER / E-MAIL-KAMPAGNEN
-- ACHTUNG: existiert laut Live-Introspektion NICHT in Produktion
-- (REST-Endpunkt antwortet 404), obwohl src/lib/newsletter.ts und
-- src/app/api/newsletter/** darauf zugreifen. Migration
-- scripts/migration-newsletter.sql wurde offenbar nie ausgeführt.
-- ============================================================

create table newsletter_campaigns (
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
create index idx_newsletter_campaigns_tenant on newsletter_campaigns(tenant_id);
create index idx_newsletter_campaigns_status on newsletter_campaigns(status);

create table newsletter_recipients (
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
create index idx_newsletter_recipients_campaign on newsletter_recipients(campaign_id);
create index idx_newsletter_recipients_pending on newsletter_recipients(campaign_id, status);
create index idx_newsletter_recipients_token on newsletter_recipients(token);

create table newsletter_unsubscribes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  email            text not null,
  campaign_id      uuid references newsletter_campaigns(id) on delete set null,
  unsubscribed_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index idx_newsletter_unsub_tenant_email on newsletter_unsubscribes(tenant_id, lower(email));

create trigger trg_newsletter_campaigns_updated_at before update on newsletter_campaigns for each row execute function set_updated_at();

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

-- ============================================================
-- 34. GOOGLE CALENDAR SYNC
-- ACHTUNG: existiert laut Live-Introspektion NICHT in Produktion
-- (REST-Endpunkt antwortet 404), obwohl src/lib/google/calendar.ts und
-- src/app/api/google-calendar/** darauf zugreifen. Migration
-- scripts/migration-google-calendar.sql wurde offenbar nie ausgeführt.
-- ============================================================

create table google_calendar_connections (
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

create trigger trg_google_calendar_connections_updated_at before update on google_calendar_connections for each row execute function set_updated_at();

alter table google_calendar_connections enable row level security;
-- Tokens werden ausschließlich serverseitig über den Admin-Client (service_role) gelesen/geschrieben.
-- Keine Client-Policy → Browser hat keinen Zugriff auf die Tokens.

alter table deadlines add column if not exists google_event_id text;

-- ============================================================
-- 35. REALTIME
-- ============================================================

do $$ begin alter publication supabase_realtime add table emails;               exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table tickets;              exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table documents;            exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table email_classification; exception when duplicate_object then null; end $$;

-- ============================================================
-- 36. TRAINING-DATA VIEW
-- ============================================================

create or replace view v_training_data as
select
  e.id               as email_id,
  e.subject,
  e.body,
  e.from_address,
  e.date             as sent_at,
  e.folder           as direction,
  c.ai_intent,
  c.ai_sentiment,
  c.ai_confidence,
  c.human_intent,
  c.human_sentiment,
  coalesce(c.human_intent, c.ai_intent)       as final_intent,
  coalesce(c.human_sentiment, c.ai_sentiment) as final_sentiment,
  c.detected_use_case,
  c.detected_industry,
  c.concerns,
  c.response_time_hours,
  c.final_outcome,
  case when c.human_intent is not null then true else false end as was_corrected
from email_classification c
join emails e on e.id = c.email_id
where c.final_outcome in ('won','lost');

-- ============================================================
-- 37. DOCUMENT CATEGORIES – Taxonomie-Daten einspielen
-- Nach diesem Skript ausführen (definieren die eigentlichen Zeilen für
-- document_categories, ~30 Basis- + ~40 erweiterte Kategorien):
--   - scripts/seed-document-categories.ts
--   - scripts/migration-categories-expand.sql
-- ============================================================

-- ============================================================
-- 38. ROLE GRANTS (service_role, authenticated, anon)
-- Ohne diese Grants schlagen Tabellen-Queries mit
-- "permission denied for table …" (Postgres 42501) fehl, sobald eine
-- Tabelle ohne die Supabase-Standardrechte angelegt wurde:
--   - service_role (Admin-Client, src/lib/supabase/admin.ts): betraf
--     u.a. profiles/tenants, wodurch withAuth() (src/lib/supabase/api.ts)
--     den Tenant nicht ermitteln konnte und API-Routes fälschlich 401
--     "Nicht autorisiert" lieferten.
--   - authenticated (RLS-Client aus withAuth(), z.B. GET /api/emails):
--     betraf u.a. emails/profiles, wodurch eingerichtete Postfächer
--     trotz erfolgreichem IMAP-Sync keine E-Mails anzeigten (Route
--     antwortete mit 500, Frontend zeigt das ohne Fehlermeldung als
--     leere Liste).
-- service_role bekommt volle Rechte (bypasst zusätzlich RLS).
-- authenticated/anon bekommen nur CRUD — Sicherheit kommt über RLS-
-- Policies (Abschnitt 32), nicht über Tabellen-Grants. Das entspricht
-- den Supabase-Standardrechten eines frisch angelegten Projekts.
-- Idempotent, deckt auch künftig neu angelegte Tabellen ab.
-- ============================================================

grant usage on schema public to service_role, authenticated, anon;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant usage, select on all sequences in schema public to authenticated, anon;
grant execute on all routines in schema public to authenticated, anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, anon;
alter default privileges in schema public grant usage, select on sequences to authenticated, anon;
alter default privileges in schema public grant execute on routines to authenticated, anon;
