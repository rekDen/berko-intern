export type CampaignStatus =
  | "draft" | "scheduled" | "sending" | "paused" | "sent" | "failed";

export type CampaignSegment = {
  all?: boolean;
  categories?: string[];
  lead_sources?: string[];
};

export type ManualRecipient = { email: string; name?: string | null };

export type NewsletterCampaign = {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  subject: string;
  body_html: string;
  // Bewusst EIN Absender-Account – siehe Migration für die Begründung
  // (kein Verteilen über mehrere Postfächer, um IONOS-Limits zu umgehen).
  sender_account_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  throttle_per_hour: number;
  track_opens: boolean;
  segment: CampaignSegment;
  manual_recipients: ManualRecipient[];
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  opened_count: number;
  unsubscribed_count: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type RecipientStatus =
  | "pending" | "sent" | "failed" | "unsubscribed" | "skipped";

export type NewsletterRecipient = {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  name: string | null;
  account_id: string | null;
  status: RecipientStatus;
  error: string | null;
  token: string;
  opened_at: string | null;
  open_count: number;
  sent_at: string | null;
};

export type SenderAccount = { id: string; email: string };
