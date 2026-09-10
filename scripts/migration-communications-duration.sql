-- Migration: Gesprächsdauer für Telefonat-Einträge in communications
-- In Supabase SQL Editor ausführen.

alter table communications
  add column if not exists duration_minutes int check (duration_minutes is null or duration_minutes >= 0);
