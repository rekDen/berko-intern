# Claude Code Prompt: Berko AI Email Classification System

## Context

Du baust ein E-Mail-Klassifikationssystem für **Berko AI CRM**, ein B2B-Sales-CRM für eine AI-Agentur, die KI-Lösungen (Voice Agents, Document AI, Workflow Automation, Custom LLM Integrations) an Kunden in den Branchen Immobilienverwaltung, Handwerk, Legal, Healthcare und E-Commerce verkauft.

Das System muss **dazulernen**: Jede eingehende E-Mail wird automatisch klassifiziert, der User kann korrigieren, und das System verbessert sich über Zeit. Outcome-Daten (Won/Lost-Deals) werden rückwärts auf alle Mails des Threads propagiert, um Trainingsdaten zu erzeugen.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (Postgres + Edge Functions + Row Level Security)
- **AI**: Anthropic Claude API (Sonnet 4) für Klassifikation
- **Hosting**: Vercel
- **Sprache**: UI auf Deutsch, Code/Comments auf Englisch

## Architektur-Überblick

```
Inbox (IMAP/Gmail/Outlook)
    ↓
Edge Function: ingest_email
    ↓
Edge Function: classify_email (→ Claude API)
    ↓
email_classification Table (AI prediction + confidence)
    ↓
UI: zeigt Tags, User korrigiert → human_* Felder
    ↓
Deal-Outcome wird Won/Lost → Outcome propagiert rückwärts auf alle Thread-Mails
    ↓
Wöchentlicher Export: korrigierte Labels + Outcomes = Training-Daten
```

## Datenmodell

### Migration 1: Enums und Core Tables

```sql
-- =====================================================
-- ENUMS
-- =====================================================

create type intent_label as enum (
  'inquiry',
  'pricing_question',
  'technical_question',
  'legal_question',
  'objection',
  'meeting_request',
  'confirmation',
  'rejection',
  'ghosting_breaker',
  'internal',
  'spam_noise'
);

create type sentiment_label as enum (
  'positive',
  'neutral',
  'skeptical',
  'negative'
);

create type funnel_stage as enum (
  'top_of_funnel',
  'mid_funnel',
  'bottom_funnel',
  'post_sale'
);

create type deal_stage as enum (
  'new_inquiry',
  'discovery',
  'qualified',
  'demo_poc',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'on_hold'
);

create type lost_reason as enum (
  'price_too_high',
  'no_budget',
  'build_vs_buy',
  'competitor_won',
  'timing',
  'unclear_use_case',
  'gdpr_concerns',
  'no_decision_maker',
  'no_response',
  'other'
);

create type stakeholder_role as enum (
  'decision_maker',
  'influencer',
  'technical_evaluator',
  'legal_evaluator',
  'procurement',
  'user',
  'blocker',
  'unknown'
);

create type ai_use_case as enum (
  'voice_agent',
  'chatbot_support',
  'document_ai',
  'workflow_automation',
  'custom_llm',
  'data_analytics_rag',
  'ai_consulting',
  'unknown'
);

create type industry_vertical as enum (
  'property_management',
  'construction_trades',
  'legal',
  'healthcare',
  'ecommerce_retail',
  'financial_services',
  'other'
);

create type lead_source as enum (
  'website_inbound',
  'linkedin_outbound',
  'referral',
  'event_webinar',
  'partner_reseller',
  'cold_email',
  'existing_customer'
);

-- =====================================================
-- CORE TABLES
-- =====================================================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  company text,
  job_title text,
  domain text generated always as (split_part(email, '@', 2)) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  name text not null,
  stage deal_stage not null default 'new_inquiry',
  use_case ai_use_case default 'unknown',
  industry industry_vertical default 'other',
  source lead_source,
  deal_value_eur numeric(12, 2),
  expected_close_date date,
  actual_close_date date,
  lost_reason_value lost_reason,
  lost_reason_note text,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table email_threads (
  id uuid primary key default gen_random_uuid(),
  subject text,
  deal_id uuid references deals(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count int default 0,
  created_at timestamptz default now()
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references email_threads(id) on delete cascade,
  message_id text unique not null, -- RFC Message-ID
  in_reply_to text,
  from_email text not null,
  from_name text,
  to_emails text[] not null,
  cc_emails text[],
  subject text,
  body_text text,
  body_html text,
  direction text check (direction in ('inbound', 'outbound')),
  sent_at timestamptz not null,
  has_attachments boolean default false,
  created_at timestamptz default now()
);

-- =====================================================
-- CLASSIFICATION TABLE (das Herzstück)
-- =====================================================

create table email_classification (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references emails(id) on delete cascade unique,
  deal_id uuid references deals(id) on delete set null,
  
  -- AI prediction (immutable, wird nie überschrieben)
  ai_intent intent_label,
  ai_sentiment sentiment_label,
  ai_funnel_stage funnel_stage,
  ai_stakeholder_role stakeholder_role,
  ai_confidence numeric(3, 2) check (ai_confidence between 0 and 1),
  ai_model_version text not null,
  ai_classified_at timestamptz default now(),
  ai_reasoning text, -- explainability
  
  -- Human correction (nullable - nur gefüllt wenn korrigiert)
  human_intent intent_label,
  human_sentiment sentiment_label,
  human_funnel_stage funnel_stage,
  human_stakeholder_role stakeholder_role,
  corrected_at timestamptz,
  corrected_by uuid references auth.users(id),
  correction_note text,
  
  -- Extrahierte Features (Entities)
  detected_use_case ai_use_case,
  detected_industry industry_vertical,
  mentioned_competitors text[],
  deal_size_signal text, -- z.B. "5 Standorte", "EU-weit"
  timeline_signal text, -- z.B. "Q3 2026", "ASAP"
  concerns text[], -- z.B. ["DSGVO", "Integration"]
  mentioned_amounts numeric[], -- extrahierte Geldbeträge
  
  -- Behavioral features
  response_time_hours int, -- Zeit seit letzter Mail im Thread
  engagement_score numeric(3, 2), -- 0-1: Öffnungen, Klicks, Anhänge
  
  -- Outcome (wird propagiert wenn Deal won/lost)
  final_outcome text check (final_outcome in ('won', 'lost', 'no_response', 'pending')),
  outcome_propagated_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- INDEXES
-- =====================================================

create index idx_emails_thread_id on emails(thread_id);
create index idx_emails_sent_at on emails(sent_at desc);
create index idx_classification_email_id on email_classification(email_id);
create index idx_classification_deal_id on email_classification(deal_id);
create index idx_classification_outcome on email_classification(final_outcome) 
  where final_outcome is not null;
create index idx_classification_confidence on email_classification(ai_confidence) 
  where ai_confidence < 0.8;
create index idx_classification_uncorrected on email_classification(corrected_at) 
  where corrected_at is null;
create index idx_deals_stage on deals(stage);
create index idx_deals_outcome on deals(stage) where stage in ('won', 'lost');

-- =====================================================
-- TRIGGERS
-- =====================================================

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_contacts_updated_at before update on contacts
  for each row execute function update_updated_at();
create trigger trg_deals_updated_at before update on deals
  for each row execute function update_updated_at();
create trigger trg_classification_updated_at before update on email_classification
  for each row execute function update_updated_at();

-- =====================================================
-- OUTCOME PROPAGATION
-- =====================================================
-- Wenn ein Deal Won/Lost wird, propagiere das Outcome auf alle 
-- Klassifikationen aller Mails dieses Deals zurück

create or replace function propagate_deal_outcome()
returns trigger language plpgsql as $$
begin
  if new.stage in ('won', 'lost') and (old.stage is distinct from new.stage) then
    update email_classification
    set 
      final_outcome = case 
        when new.stage = 'won' then 'won'
        when new.stage = 'lost' then 'lost'
      end,
      outcome_propagated_at = now()
    where deal_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_propagate_outcome 
  after update on deals
  for each row execute function propagate_deal_outcome();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

alter table contacts enable row level security;
alter table deals enable row level security;
alter table email_threads enable row level security;
alter table emails enable row level security;
alter table email_classification enable row level security;

-- Policies: User sieht nur eigene Deals + zugehörige Daten
create policy "Users see own deals" on deals
  for all using (owner_id = auth.uid());

create policy "Users see emails of own deals" on emails
  for all using (
    thread_id in (
      select id from email_threads 
      where deal_id in (select id from deals where owner_id = auth.uid())
    )
  );

create policy "Users see own classifications" on email_classification
  for all using (
    deal_id in (select id from deals where owner_id = auth.uid())
  );
```

### Migration 2: Training-Data View

```sql
-- View für ML-Export: nur Mails mit Outcome + Human Label
create view v_training_data as
select
  e.id as email_id,
  e.subject,
  e.body_text,
  e.from_email,
  e.sent_at,
  e.direction,
  c.ai_intent,
  c.ai_sentiment,
  c.ai_confidence,
  c.human_intent,
  c.human_sentiment,
  coalesce(c.human_intent, c.ai_intent) as final_intent,
  coalesce(c.human_sentiment, c.ai_sentiment) as final_sentiment,
  c.detected_use_case,
  c.detected_industry,
  c.concerns,
  c.response_time_hours,
  c.engagement_score,
  c.final_outcome,
  d.stage as deal_stage,
  d.deal_value_eur,
  d.lost_reason_value,
  case when c.human_intent is not null then true else false end as was_corrected
from email_classification c
join emails e on e.id = c.email_id
join deals d on d.id = c.deal_id
where c.final_outcome in ('won', 'lost');
```

## Edge Function: classify_email

**Datei**: `supabase/functions/classify_email/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";

const MODEL_VERSION = "claude-sonnet-4-20250514";

const CLASSIFICATION_PROMPT = `Du bist ein Klassifikator für B2B-Sales-E-Mails einer AI-Agentur.

Klassifiziere die folgende E-Mail nach diesen Dimensionen:

**Intent** (was will der Absender?):
- inquiry: Erstanfrage / Interesse
- pricing_question: Frage zu Kosten/Angebot
- technical_question: Frage zu Integration, API, Daten
- legal_question: DSGVO, AVV, Vertrag
- objection: Einwand / Skepsis
- meeting_request: Termin vereinbaren
- confirmation: Zusage / Bestätigung
- rejection: Absage
- ghosting_breaker: nach langer Stille wieder da
- internal: interne Mail (nicht Kunde)
- spam_noise: Newsletter, Automated, irrelevant

**Sentiment**: positive | neutral | skeptical | negative

**Funnel Stage**: top_of_funnel | mid_funnel | bottom_funnel | post_sale

**Stakeholder Role**: decision_maker | influencer | technical_evaluator | legal_evaluator | procurement | user | blocker | unknown

**Use Case** (welche AI-Lösung?): voice_agent | chatbot_support | document_ai | workflow_automation | custom_llm | data_analytics_rag | ai_consulting | unknown

**Industry**: property_management | construction_trades | legal | healthcare | ecommerce_retail | financial_services | other

**Entities extrahieren**:
- mentioned_competitors: Array von Konkurrenten-Namen (z.B. ["Synthesia", "HeyGen"])
- deal_size_signal: Hinweise auf Größe (z.B. "5 Standorte", "EU-weit", "ein Pilot")
- timeline_signal: Zeitliche Signale (z.B. "Q3 2026", "ASAP", "noch unklar")
- concerns: Bedenken/Hindernisse (z.B. ["DSGVO", "Integration", "Preis"])
- mentioned_amounts: Geldbeträge in EUR als Zahlen

**Confidence**: 0.0-1.0 wie sicher bist du bei Intent + Sentiment zusammen

**Reasoning**: 1-2 Sätze warum (für Explainability)

Antworte AUSSCHLIESSLICH mit gültigem JSON in diesem exakten Format - kein Markdown, keine Backticks, kein Vorwort:

{
  "intent": "...",
  "sentiment": "...",
  "funnel_stage": "...",
  "stakeholder_role": "...",
  "use_case": "...",
  "industry": "...",
  "mentioned_competitors": [],
  "deal_size_signal": null,
  "timeline_signal": null,
  "concerns": [],
  "mentioned_amounts": [],
  "confidence": 0.0,
  "reasoning": "..."
}`;

interface ClassificationResult {
  intent: string;
  sentiment: string;
  funnel_stage: string;
  stakeholder_role: string;
  use_case: string;
  industry: string;
  mentioned_competitors: string[];
  deal_size_signal: string | null;
  timeline_signal: string | null;
  concerns: string[];
  mentioned_amounts: number[];
  confidence: number;
  reasoning: string;
}

serve(async (req) => {
  try {
    const { email_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Email + Thread laden
    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select("*, email_threads(deal_id, message_count)")
      .eq("id", email_id)
      .single();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404,
      });
    }

    // Response Time berechnen
    const { data: prevEmail } = await supabase
      .from("emails")
      .select("sent_at")
      .eq("thread_id", email.thread_id)
      .lt("sent_at", email.sent_at)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    const responseTimeHours = prevEmail
      ? Math.round(
          (new Date(email.sent_at).getTime() -
            new Date(prevEmail.sent_at).getTime()) /
            (1000 * 60 * 60)
        )
      : null;

    // Claude API call
    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
    });

    const emailContent = `
Von: ${email.from_name || ""} <${email.from_email}>
Betreff: ${email.subject || "(kein Betreff)"}
Datum: ${email.sent_at}
Richtung: ${email.direction}

${email.body_text || ""}
    `.trim();

    const response = await anthropic.messages.create({
      model: MODEL_VERSION,
      max_tokens: 1024,
      system: CLASSIFICATION_PROMPT,
      messages: [{ role: "user", content: emailContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Robust JSON parsing - strip potential markdown fences
    const cleanedJson = textBlock.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const result: ClassificationResult = JSON.parse(cleanedJson);

    // Speichern (upsert weil unique constraint auf email_id)
    const { error: insertErr } = await supabase
      .from("email_classification")
      .upsert(
        {
          email_id,
          deal_id: email.email_threads?.deal_id,
          ai_intent: result.intent,
          ai_sentiment: result.sentiment,
          ai_funnel_stage: result.funnel_stage,
          ai_stakeholder_role: result.stakeholder_role,
          ai_confidence: result.confidence,
          ai_model_version: MODEL_VERSION,
          ai_reasoning: result.reasoning,
          detected_use_case: result.use_case,
          detected_industry: result.industry,
          mentioned_competitors: result.mentioned_competitors,
          deal_size_signal: result.deal_size_signal,
          timeline_signal: result.timeline_signal,
          concerns: result.concerns,
          mentioned_amounts: result.mentioned_amounts,
          response_time_hours: responseTimeHours,
          final_outcome: "pending",
        },
        { onConflict: "email_id" }
      );

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Classification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
```

## UI-Komponente: Email Detail mit Klassifikation

**Datei**: `src/components/email/EmailClassificationPanel.tsx`

Anforderungen:

1. **Header** mit Absender (Avatar mit Initialen aus `from_name`), Betreff, Datum.
2. **Body** der E-Mail als Plain Text mit `whitespace-pre-wrap`.
3. **AI-Klassifikations-Panel** (visuell abgesetzt mit `bg-muted/50`):
   - Header: Sparkles-Icon + "AI-Klassifikation" + Confidence-Score rechts
   - **Tags** als Pills (flex-wrap, gap-2):
     - Intent: lila Pill (`bg-purple-100 text-purple-900`)
     - Sentiment: grün/grau/amber/rot je nach Wert
     - Stage: blau (`bg-blue-100 text-blue-900`)
     - Role: amber (`bg-amber-100 text-amber-900`)
   - **Extrahierte Signale** als Tabelle (Label links, Wert rechts):
     - Use Case, Industry, Deal Size Signal, Timeline, Concerns (als comma-separated), Response Time
   - **Win-Probability-Bar** (berechnet aus simpler Heuristik: `0.5 + sentiment_boost + stage_boost - concerns_penalty`, später durch ML ersetzbar):
     - Horizontaler Balken, Farbe je nach Wert (grün >70%, amber 40-70%, rot <40%)
   - **Action-Buttons**:
     - "Tags bestätigen" (Check-Icon) → schreibt `human_*` = `ai_*` in DB
     - "Korrigieren" (Edit-Icon) → öffnet Modal mit Dropdowns für jede Dimension
     - "Antwort vorschlagen" (Sparkles, rechts ausgerichtet) → ruft separate Edge Function `suggest_reply`
4. **Confidence-Warnung**: Bei Confidence < 0.8 zeige gelben Hinweis "Diese Klassifikation ist unsicher - bitte überprüfen".

**Korrektur-Modal**: Vier Dropdowns (Intent, Sentiment, Stage, Role) mit den Enum-Werten als Optionen, optionales Notizfeld, "Speichern"-Button schreibt nach `email_classification.human_*` Felder UND setzt `corrected_at = now()`, `corrected_by = auth.user.id`.

**Wichtig**: Die `ai_*` Felder werden NIE überschrieben. Beide Werte sind permanente Trainingsdaten.

## Lernzyklus implementieren

### 1. Auto-Classification Trigger

Bei jedem neuen Email-Eintrag (`emails` INSERT) wird automatisch die Edge Function `classify_email` getriggert. Implementiere das als Postgres Trigger der via `pg_net` einen HTTP-Call macht, ODER (sauberer) als Database Webhook in der Supabase UI.

### 2. Outcome-Propagation

Bereits in der Migration als Trigger (`trg_propagate_outcome`). Wenn `deals.stage` auf `won`/`lost` gesetzt wird, werden alle `email_classification` Einträge dieses Deals mit `final_outcome` aktualisiert.

### 3. Training-Data Export

CLI-Script `scripts/export_training_data.ts` exportiert die View `v_training_data` als JSONL für späteres Fine-Tuning. Felder im Output:

```json
{
  "input": "Von: ...\nBetreff: ...\n\n[Body]",
  "labels": {
    "intent": "pricing_question",
    "sentiment": "positive",
    ...
  },
  "outcome": "won",
  "metadata": {
    "was_corrected": true,
    "ai_confidence": 0.84,
    "ai_was_correct": false
  }
}
```

### 4. Metrics Dashboard

Baue eine Seite `/admin/classifier-metrics` mit:
- **Accuracy per Dimension**: `count(ai_intent = human_intent) / count(corrected)` für Intent, Sentiment, etc.
- **Confusion Matrix** pro Dimension (z.B. Intent: 11x11 Matrix)
- **Correction Rate over Time** (Liniendiagramm)
- **Confidence Calibration**: Bucket-Plot (Confidence-Bin x Accuracy)
- **Outcome-Correlation**: Welche Tag-Sequenzen führen zu Won vs Lost (Sankey-Diagramm)

## Akzeptanzkriterien

- [ ] Migration läuft fehlerfrei durch (`supabase db reset` + `supabase db push`)
- [ ] Bei Insert einer Test-Email wird automatisch ein `email_classification` Eintrag erzeugt
- [ ] AI-Klassifikation liefert valides JSON mit allen Pflichtfeldern
- [ ] User kann Tags im UI mit einem Klick bestätigen oder korrigieren
- [ ] Korrekturen schreiben in `human_*` Felder, `ai_*` bleibt unverändert
- [ ] Wenn ein Deal auf `won` gesetzt wird, haben alle zugehörigen Klassifikationen `final_outcome = 'won'`
- [ ] RLS verhindert dass User A die Daten von User B sieht
- [ ] Training-Data-Export liefert JSONL nur mit Mails die ein finales Outcome haben
- [ ] Confidence < 0.8 wird visuell hervorgehoben

## Out-of-Scope (Phase 2)

- IMAP/Gmail-Integration für tatsächlichen Mail-Ingest (Phase 2)
- Reply-Suggestion Edge Function (Phase 2)
- Auto-Fine-Tuning Pipeline (Phase 3)
- Sequenzielle Klassifikation auf Thread-Ebene (Phase 3)

## Projektstruktur

```
akturio-crm/
├── supabase/
│   ├── migrations/
│   │   ├── 20260101000000_classification_core.sql
│   │   └── 20260101000001_training_view.sql
│   └── functions/
│       └── classify_email/
│           └── index.ts
├── src/
│   ├── components/
│   │   └── email/
│   │       ├── EmailClassificationPanel.tsx
│   │       ├── ClassificationTags.tsx
│   │       ├── CorrectionModal.tsx
│   │       └── WinProbabilityBar.tsx
│   ├── app/
│   │   ├── inbox/[emailId]/page.tsx
│   │   └── admin/classifier-metrics/page.tsx
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts
│       │   └── types.ts (generiert)
│       └── classification/
│           ├── intent-labels.ts
│           ├── win-probability.ts
│           └── export-training-data.ts
└── scripts/
    └── export_training_data.ts
```

## Start

Beginne mit:

1. Supabase-Projekt initialisieren (`supabase init`)
2. Migration 1 und 2 anlegen
3. TypeScript-Types generieren (`supabase gen types typescript`)
4. Edge Function `classify_email` deployen
5. UI-Komponenten bauen (mit Mock-Daten erstmal)
6. End-to-End Test mit einer Beispiel-Email

Frage zwischendurch nach, wenn etwas unklar ist (z.B. ob bestimmte Enum-Werte erweitert werden sollen). Bestätige nach jedem Schritt was fertig ist, bevor du weitermachst.
