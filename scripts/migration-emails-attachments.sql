-- ============================================================
-- Migration: E-Mail-Anhänge
-- ============================================================
-- Speichert Metadaten der Anhänge (Dateiname, Größe, Typ, Storage-Pfad)
-- als JSON-Array auf der emails-Zeile. Die Dateien selbst liegen im
-- 'documents'-Storage-Bucket unter {tenant_id}/email/{uuid}.{ext}
--
-- Beispiel-Eintrag:
--   [{ "filename": "vertrag.pdf", "size": 12345,
--      "contentType": "application/pdf",
--      "path": "73272437-.../email/ab12cd34.pdf" }]

alter table emails
  add column if not exists attachments jsonb not null default '[]'::jsonb;
