export type IntentLabel =
  | "inquiry" | "pricing_question" | "technical_question" | "legal_question"
  | "objection" | "meeting_request" | "confirmation" | "rejection"
  | "ghosting_breaker" | "internal" | "spam_noise";

export type SentimentLabel = "positive" | "neutral" | "skeptical" | "negative";
export type FunnelStage = "top_of_funnel" | "mid_funnel" | "bottom_funnel" | "post_sale";
export type StakeholderRole =
  | "decision_maker" | "influencer" | "technical_evaluator" | "legal_evaluator"
  | "procurement" | "user" | "blocker" | "unknown";
export type AiUseCase =
  | "voice_agent" | "chatbot_support" | "document_ai" | "workflow_automation"
  | "custom_llm" | "data_analytics_rag" | "ai_consulting" | "unknown";
export type IndustryVertical =
  | "property_management" | "construction_trades" | "legal" | "healthcare"
  | "ecommerce_retail" | "financial_services" | "other";

export interface EmailClassification {
  id: string;
  email_id: string;
  ai_intent: IntentLabel | null;
  ai_sentiment: SentimentLabel | null;
  ai_funnel_stage: FunnelStage | null;
  ai_stakeholder_role: StakeholderRole | null;
  ai_confidence: number | null;
  ai_model_version: string;
  ai_classified_at: string;
  ai_reasoning: string | null;
  human_intent: IntentLabel | null;
  human_sentiment: SentimentLabel | null;
  human_funnel_stage: FunnelStage | null;
  human_stakeholder_role: StakeholderRole | null;
  corrected_at: string | null;
  correction_note: string | null;
  detected_use_case: AiUseCase | null;
  detected_industry: IndustryVertical | null;
  mentioned_competitors: string[];
  deal_size_signal: string | null;
  timeline_signal: string | null;
  concerns: string[];
  mentioned_amounts: number[];
  response_time_hours: number | null;
  final_outcome: "won" | "lost" | "no_response" | "pending" | null;
}

export interface EmailAttachment {
  filename: string;
  size: number;
  contentType: string;
  /** Storage-Pfad im 'documents'-Bucket */
  path: string;
}

export interface Email {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  date: string;
  folder: "inbox" | "sent" | "draft";
  read: boolean;
  starred: boolean;
  aiSummary: string;
  aiDraft: string;
  aiLegal: string;
  toAddress: string | null;
  cc: string | null;
  bcc: string | null;
  linkedContactId: string | null;
  linkedPropertyId: string | null;
  linkedTicketId: string | null;
  linkedContractId: string | null;
  classification?: EmailClassification | null;
}

export interface Deadline {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "frist" | "termin";
  az: string;
  completed: boolean;
  assignedTo: string;
}

export interface LegalQA {
  q: string;
  a: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
