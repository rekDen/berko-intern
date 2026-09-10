import { NextRequest, NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();
const MODEL_VERSION = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Du bist ein Klassifikator für B2B-Sales-E-Mails einer AI-Agentur.

Klassifiziere die folgende E-Mail nach diesen Dimensionen:

**Intent**: inquiry | pricing_question | technical_question | legal_question | objection | meeting_request | confirmation | rejection | ghosting_breaker | internal | spam_noise

**Sentiment**: positive | neutral | skeptical | negative

**Funnel Stage**: top_of_funnel | mid_funnel | bottom_funnel | post_sale

**Stakeholder Role**: decision_maker | influencer | technical_evaluator | legal_evaluator | procurement | user | blocker | unknown

**Use Case**: voice_agent | chatbot_support | document_ai | workflow_automation | custom_llm | data_analytics_rag | ai_consulting | unknown

**Industry**: property_management | construction_trades | legal | healthcare | ecommerce_retail | financial_services | other

**Entities**:
- mentioned_competitors: Array von Konkurrenten-Namen
- deal_size_signal: Hinweis auf Größe (z.B. "5 Standorte", "EU-weit")
- timeline_signal: Zeitliche Signale (z.B. "Q3 2026", "ASAP")
- concerns: Bedenken (z.B. ["DSGVO", "Integration"])
- mentioned_amounts: Geldbeträge in EUR als Zahlen

**Confidence**: 0.0–1.0

**Reasoning**: 1–2 Sätze (Deutsch)

Antworte AUSSCHLIESSLICH mit gültigem JSON — kein Markdown, keine Backticks:

{"intent":"...","sentiment":"...","funnel_stage":"...","stakeholder_role":"...","use_case":"...","industry":"...","mentioned_competitors":[],"deal_size_signal":null,"timeline_signal":null,"concerns":[],"mentioned_amounts":[],"confidence":0.0,"reasoning":"..."}`;

// GET /api/emails/:id/classify — load existing classification
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;

  const { data, error } = await supabase
    .from("email_classification")
    .select("*")
    .eq("email_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

// POST /api/emails/:id/classify — run AI classification and store result
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;

  const { data: email, error: fetchError } = await supabase
    .from("emails")
    .select("id, tenant_id, subject, body, from_address, from_name, date, folder")
    .eq("id", id)
    .single();

  if (fetchError || !email) {
    return NextResponse.json({ error: "E-Mail nicht gefunden" }, { status: 404 });
  }

  // Compute response_time_hours from previous email in inbox
  const { data: prevEmail } = await supabase
    .from("emails")
    .select("date")
    .eq("tenant_id", email.tenant_id)
    .eq("folder", "inbox")
    .lt("date", email.date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const responseTimeHours = prevEmail
    ? Math.round((new Date(email.date).getTime() - new Date(prevEmail.date).getTime()) / 3600000)
    : null;

  const emailContent = `Von: ${email.from_name} <${email.from_address}>
Betreff: ${email.subject}
Datum: ${email.date}
Richtung: ${email.folder}

${email.body ?? ""}`.trim();

  try {
    const response = await anthropic.messages.create({
      model: MODEL_VERSION,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: emailContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("Keine Antwort von Claude");

    const cleaned = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(cleaned);

    const admin = createAdminClient();
    const { data: saved, error: upsertErr } = await admin
      .from("email_classification")
      .upsert(
        {
          email_id: id,
          tenant_id: email.tenant_id,
          ai_intent: result.intent,
          ai_sentiment: result.sentiment,
          ai_funnel_stage: result.funnel_stage,
          ai_stakeholder_role: result.stakeholder_role,
          ai_confidence: result.confidence,
          ai_model_version: MODEL_VERSION,
          ai_classified_at: new Date().toISOString(),
          ai_reasoning: result.reasoning,
          detected_use_case: result.use_case,
          detected_industry: result.industry,
          mentioned_competitors: result.mentioned_competitors ?? [],
          deal_size_signal: result.deal_size_signal ?? null,
          timeline_signal: result.timeline_signal ?? null,
          concerns: result.concerns ?? [],
          mentioned_amounts: result.mentioned_amounts ?? [],
          response_time_hours: responseTimeHours,
          final_outcome: "pending",
        },
        { onConflict: "email_id" }
      )
      .select()
      .single();

    if (upsertErr) throw upsertErr;
    return NextResponse.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/emails/:id/classify — human correction
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await withAuth();
  if (!supabase || !user) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_classification")
    .update({
      human_intent: body.intent ?? null,
      human_sentiment: body.sentiment ?? null,
      human_funnel_stage: body.funnel_stage ?? null,
      human_stakeholder_role: body.stakeholder_role ?? null,
      correction_note: body.note ?? null,
      corrected_at: new Date().toISOString(),
      corrected_by: user.id,
    })
    .eq("email_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
