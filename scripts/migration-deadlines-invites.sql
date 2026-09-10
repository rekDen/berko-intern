-- Eingeladene Personen (E-Mail-Adressen) zu Terminen/Fristen.
alter table deadlines add column if not exists invite_emails jsonb not null default '[]';
