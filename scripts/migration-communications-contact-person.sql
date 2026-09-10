-- Add contact_person field to communications (selected Ansprechpartner for legal entity contacts)
alter table communications add column if not exists contact_person text;
