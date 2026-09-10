-- Verknüpft Fristen/Termine optional mit einem Kontakt.
alter table deadlines add column if not exists contact_id uuid references contacts(id);
create index if not exists idx_deadlines_contact on deadlines(contact_id) where contact_id is not null;
