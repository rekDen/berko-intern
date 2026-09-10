-- Migration: Replace old contract-specific schema with CRM deal schema
-- Run this once in the Supabase SQL editor.

-- 1. Add new CRM deal columns
alter table contracts
  add column if not exists title               text,
  add column if not exists description         text,
  add column if not exists contact_id          uuid references contacts(id),
  add column if not exists amount              numeric(12,2),
  add column if not exists currency            text not null default 'EUR',
  add column if not exists probability         smallint check (probability >= 0 and probability <= 100),
  add column if not exists expected_close_date date,
  add column if not exists actual_close_date   date,
  add column if not exists source              text,
  add column if not exists source_campaign     text,
  add column if not exists referral_contact_id uuid references contacts(id),
  add column if not exists lost_to_competitor  text,
  add column if not exists lost_notes          text,
  add column if not exists last_activity_at    timestamptz,
  add column if not exists next_activity_at    timestamptz,
  add column if not exists forecast_category   text,
  add column if not exists priority            text check (priority in ('low','medium','high','urgent'));

-- 2. Drop old columns (contact_role_id cascade removes its FK index too)
alter table contracts
  drop column if exists contact_role_id         cascade,
  drop column if exists type,
  drop column if exists start_date,
  drop column if exists end_date,
  drop column if exists notice_period_months,
  drop column if exists is_fixed_term,
  drop column if exists indexation,
  drop column if exists graduated_rent,
  drop column if exists cold_rent,
  drop column if exists operating_costs_prepayment,
  drop column if exists heating_costs_prepayment,
  drop column if exists hausgeld,
  drop column if exists deposit_amount,
  drop column if exists deposit_type,
  drop column if exists deposit_custody,
  drop column if exists deal_value_eur,
  drop column if exists mrr_value,
  drop column if exists demo_happened_at,
  drop column if exists trial_start_at,
  drop column if exists trial_end_at;
