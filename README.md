# Berko AI – Internes CRM

Internes CRM für das Berko-AI-Team: Kontakte, Deals, Vertrieb, Telefonie, E-Mail, Newsletter, Fristen und Dokumente in einer Oberfläche. Alle Nutzer arbeiten in einem gemeinsamen Workspace (ein Tenant).

Das npm-Paket heißt `intern-crm`, das GitHub-Repository `berko-intern`. Die Codebasis teilt sich Architektur und viele Bausteine mit `berko-immo`. Die Konventionen stehen in [00-architecture-overview.md](00-architecture-overview.md).

## Tech-Stack

- **Frontend/Backend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Datenbank & Auth:** Supabase (Postgres, Auth, Storage, Row Level Security)
- **KI:** Anthropic Claude (`@anthropic-ai/sdk`)
- **E-Mail:** IMAP (`imapflow`, `mailparser`) und SMTP (`nodemailer`)
- **Telefonie:** Twilio (Voice SDK im Browser, TwiML-Webhooks)
- **Kalender:** Google Calendar (OAuth), Immoware (CalDAV), iCal-Export
- **Diagramme & PDF:** Recharts, Puppeteer
- **Transkription:** ElevenLabs
- **Tests:** Vitest

## Module

| Menüpunkt | Pfad | Inhalt |
|---|---|---|
| Dashboard | `/dashboard` | Überblick und Kennzahlen |
| Kontakte | `/kontakte` | Kontakte, Ansprechpartner, Kommunikationsverlauf |
| Deals | `/deals` | Vertriebspipeline |
| KPIs | `/kpis` | Vertriebsziele, Anrufauswertung |
| Verträge | `/vertraege` | Verträge und Vertragsvorlage (PDF) |
| Dokumente | `/dokumente` | Dokumentenablage in Supabase Storage |
| Lead-Suche | `/akquisition` | Firmensuche über Google Places, Abgleich mit bestehenden Kontakten |
| Anrufliste | `/telefonaktivitaeten` | Anrufe über Twilio, Protokoll |
| Rückrufliste | `/rueckrufliste` | Offene Rückrufe |
| E-Mails | `/emails` | IMAP-Postfach, KI-Zusammenfassung und -Klassifizierung, Versand |
| Newsletter | `/newsletter` | Kampagnen, Versand per Cron, Öffnungs-Tracking, Abmeldung |
| Fristen & Termine | `/deadlines` | Fristen, Termineinladungen, Google- und Immoware-Kalender, iCal-Feed |
| KI | `/legal-ai` | Chat mit Claude |
| Diktat | `/dictation` | Diktate mit Transkription |
| Einstellungen | `/einstellungen` | Profil, Postfach, Kalenderanbindung |
| Bugs / Features | `/bugs-features` | Internes Feedback-Board |

## Voraussetzungen

- Node.js 20 oder neuer
- Ein Supabase-Projekt
- Je nach Modul: Anthropic-, Twilio-, Google- und Immoware-Zugänge

## Einrichtung

```bash
npm install
```

Danach eine `.env.local` im Projektroot anlegen.

### Umgebungsvariablen

| Variable | Verwendung |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase-Client im Browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-seitiger Zugriff, umgeht RLS (nie im Frontend nutzen) |
| `CREDENTIALS_ENCRYPTION_KEY` | 32 Byte, Base64. Verschlüsselt gespeicherte IMAP-Passwörter (AES-256-GCM). Nicht verlieren und nicht wechseln. Teilen sich mehrere Apps dieselbe Datenbank, muss der Schlüssel überall gleich sein. |
| `ANTHROPIC_API_KEY` | Claude (KI-Chat, E-Mail-Zusammenfassung, Klassifizierung) |
| `APP_URL` | Öffentliche Basis-URL. Wird für OAuth-Callbacks, Newsletter-Links und die Twilio-Signaturprüfung gebraucht. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID` | Twilio Voice im Browser (Access Token) |
| `TWILIO_ACCOUNT_SID_KEY` bzw. `TWILIO_AUTH_TOKEN` | Twilio-Auth-Token, prüft die Signatur eingehender Webhooks |
| `TWILIO_PHONE_NUMBER`, `TWILIO_AURABAD_PHONE_NUMBER` | Rufnummern für ausgehende und eingehende Anrufe |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google-Calendar-Anbindung (OAuth) |
| `GOOGLE_PLACES_API_KEY` | Lead-Suche |
| `IMMOWARE_CALDAV_URL`, `IMMOWARE_CALDAV_USER`, `IMMOWARE_CALDAV_PASSWORD` | Immoware-Kalender |
| `ELEVENLABS_API_KEY` | Transkription von Diktaten |
| `LEADS_API_KEY` | API-Key für `POST /api/leads`, erwartet im Header `api_key`. Ohne gesetzten Wert lehnt die Route jede Anfrage ab. |
| `CRON_SECRET` | Schützt den Newsletter-Versand per Cron (`Authorization: Bearer …`) |

Schlüssel für `CREDENTIALS_ENCRYPTION_KEY` erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`.env.local` enthält Secrets und gehört nie ins Repository.

### Datenbank

1. Für eine neue Datenbank [supabase-schema-init.sql](supabase-schema-init.sql) einspielen. [supabase-schema.sql](supabase-schema.sql) ist der ältere Stand.
2. Danach die Migrationen aus [scripts/](scripts) (`migration-*.sql`) einspielen.
3. Haben mehrere Nutzer bereits eigene Tenants, legt `scripts/migration-shared-tenant.sql` sie einmalig zu einem gemeinsamen Workspace zusammen.
4. Optional Testdaten laden (`scripts/seed-*.sql` bzw. `seed-*.ts`).

Die Registrierung neuer Nutzer sollte in Supabase deaktiviert sein, da alle Nutzer denselben Workspace sehen.

## Entwicklung

```bash
npm run dev          # Dev-Server auf http://localhost:3000
npm run build        # Produktions-Build
npm run start        # Produktions-Server
npm run lint         # ESLint
npm test             # Vitest (einmalig)
npm run test:watch   # Vitest im Watch-Modus
```

## Projektstruktur

```
src/
  app/
    (app)/       Geschützte Oberfläche (eine Seite pro Modul)
    api/         Route Handler pro Modul
    login/       Anmeldung
  components/    UI-Komponenten (crm, dms, email, App-Shell, Sidebar)
  lib/           Supabase-Clients, IMAP, Google- und Immoware-Kalender,
                 Newsletter, Verschlüsselung, Twilio-Webhook-Prüfung
  middleware.ts  Auth-Prüfung, öffentliche Ausnahmen
scripts/         SQL-Migrationen, Seeds, Hilfsskripte
docs/            Prompts und Spezifikationen
supabase/        Supabase-CLI-Konfiguration
```

## Sicherheit

- Die Middleware leitet nicht angemeldete Nutzer auf `/login` um. Fehlt die Supabase-Konfiguration, lehnt sie jede Anfrage mit 503 ab.
- Öffentlich erreichbar sind nur `/api/leads` (per API-Key im Header `api_key`) und die Twilio-Webhooks `/api/twilio/voice` und `/api/twilio/aurabad-voice`. Die Webhooks prüfen die `X-Twilio-Signature` und lehnen ungültige Aufrufe mit 403 ab. `APP_URL` muss dafür zur Webhook-URL in Twilio passen.
- IMAP-Passwörter werden verschlüsselt gespeichert. Ältere Klartext-Passwörter werden beim nächsten Abruf automatisch verschlüsselt.

## E-Mail-Integration

```
Browser                    Next.js (Server)             Extern
/emails
  │ GET  /api/emails ───────► emails-Tabelle (Supabase)
  │ POST /api/emails/sync ──► imap.ts ───────────────► IONOS IMAP (imap.ionos.de:993)
  │ GET/POST /api/emails/credentials                     holt neue Mails,
  │   (Passwort verschlüsselt in email_accounts)         speichert in emails
```

Neue Mails kommen in Echtzeit an:

```
IMAP IDLE → Supabase DB INSERT → Supabase Realtime (WebSocket) → Browser
            (SSE-Route schreibt)                                  (Liste + Toast)

EventSource ─────────────────────────────────────────────────► Live-Badge
(hält IMAP IDLE am Leben, sendet keine Benachrichtigungen mehr)
```

Der Browser bekommt neue Mails über Supabase Realtime statt über das SSE-Event selbst. Das ist robuster als die frühere Kette `IMAP IDLE → SSE → refreshEmails()`.

## Bekannte Einschränkungen

- `POST /api/generate-pdf` startet Chrome über einen festen macOS-Pfad und funktioniert deshalb nur lokal auf einem Mac.
- Die Weiterleitungsnummern für eingehende Anrufe stehen fest in den Twilio-Routen.
- Die Twilio-Testseite (`/twilio-test`, `api/twilio/test-*`) ist auch in der Produktion erreichbar (nur mit Login).

## Weiterführende Dokumente

- [00-architecture-overview.md](00-architecture-overview.md): Stack, RLS, Naming, Fehlerbehandlung
- [docs/specs/responsive-layout.md](docs/specs/responsive-layout.md): Mobile Layout
- [docs/prompts/](docs/prompts): Modul-Prompts für CRM und DMS
- [scripts/README.md](scripts/README.md): Versand von Test-E-Mails
