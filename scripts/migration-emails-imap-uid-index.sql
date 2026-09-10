-- Fix: imap_uid muss pro Benutzer (created_by) eindeutig sein, nicht pro Tenant.
-- Jedes Postfach hat eigene, unabhängige UIDs (beginnen bei 1).
-- Der alte tenant-weite Index verhinderte das Importieren von E-Mails
-- anderer Benutzer, wenn ihre UIDs mit bereits vorhandenen kollidierten.
drop index if exists idx_emails_imap_uid;
create unique index idx_emails_imap_uid on emails(created_by, imap_uid) where imap_uid is not null;
