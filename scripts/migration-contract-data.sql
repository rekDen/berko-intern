-- Adds a JSONB column to store structured form data extracted from the contract template
alter table contracts
  add column if not exists contract_data jsonb;
