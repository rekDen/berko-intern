import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";

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

serve(async (req) => {
  try {
    const { email_id } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: email, error: emailErr } = await supabase
      .from("emails")
      .select("id, tenant_id, subject, body, from_address, from_name, date, folder")
      .eq("id", email_id)
      .single();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), { status: 404 });
    }

    // Compute response_time_hours
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

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

    const emailContent = `Von: ${email.from_name} <${email.from_address}>
Betreff: ${email.subject}
Datum: ${email.date}
Richtung: ${email.folder}

${email.body ?? ""}`.trim();

    const response = await anthropic.messages.create({
      model: MODEL_VERSION,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: emailContent }],
    });

    const textBlock = response.content.find((b: { type: string }) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

    const cleaned = (textBlock as { type: "text"; text: string }).text
      .replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(cleaned);

    const { data: saved, error: upsertErr } = await supabase
      .from("email_classification")
      .upsert(
        {
          email_id,
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

    return new Response(JSON.stringify({ success: true, data: saved }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Classification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
