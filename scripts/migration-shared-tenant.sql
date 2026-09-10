-- Konsolidiert alle Daten auf den ältesten Tenant (gemeinsamer Workspace).
-- Einmalig ausführen wenn bereits mehrere Nutzer mit separaten Tenants existieren.

do $$
declare
  shared_id uuid;
begin
  -- Ältesten Tenant als gemeinsamen Workspace verwenden
  select id into shared_id from tenants order by created_at asc limit 1;

  if shared_id is null then
    raise notice 'Kein Tenant gefunden – nichts zu tun.';
    return;
  end if;

  raise notice 'Gemeinsamer Tenant: %', shared_id;

  -- Alle Profile auf diesen Tenant umziehen
  update profiles    set tenant_id = shared_id where tenant_id <> shared_id;

  -- Alle Datentabellen umziehen
  update contacts          set tenant_id = shared_id where tenant_id <> shared_id;
  update properties        set tenant_id = shared_id where tenant_id <> shared_id;
  update units             set tenant_id = shared_id where tenant_id <> shared_id;
  update contact_roles     set tenant_id = shared_id where tenant_id <> shared_id;
  update contracts         set tenant_id = shared_id where tenant_id <> shared_id;
  update bank_accounts     set tenant_id = shared_id where tenant_id <> shared_id;
  update tickets           set tenant_id = shared_id where tenant_id <> shared_id;
  update communications    set tenant_id = shared_id where tenant_id <> shared_id;
  update activities        set tenant_id = shared_id where tenant_id <> shared_id;
  update audit_log         set tenant_id = shared_id where tenant_id <> shared_id;
  update deadlines         set tenant_id = shared_id where tenant_id <> shared_id;
  update documents         set tenant_id = shared_id where tenant_id <> shared_id;
  update document_markers  set tenant_id = shared_id where tenant_id <> shared_id;
  update document_batches  set tenant_id = shared_id where tenant_id <> shared_id;
  update emails            set tenant_id = shared_id where tenant_id <> shared_id;
  update email_classification set tenant_id = shared_id where tenant_id <> shared_id;
  update email_accounts    set tenant_id = shared_id where tenant_id <> shared_id;
  update dictations        set tenant_id = shared_id where tenant_id <> shared_id;
  update chat_messages     set tenant_id = shared_id where tenant_id <> shared_id;
  update sales_targets     set tenant_id = shared_id where tenant_id <> shared_id;

  -- Verwaiste Tenants löschen
  delete from tenants where id <> shared_id;

  raise notice 'Migration abgeschlossen.';
end $$;
