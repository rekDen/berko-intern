-- Add availability field to contacts (Erreichbarkeit)
alter table contacts add column if not exists availability text;
