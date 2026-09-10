"use client";

import { useState } from "react";
import {
  Sparkles,
  Check,
  Edit3,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import type {
  EmailClassification,
  IntentLabel,
  SentimentLabel,
  FunnelStage,
  StakeholderRole,
} from "@/types";

// ── Label maps ────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<IntentLabel, string> = {
  inquiry: "Anfrage",
  pricing_question: "Preisfrage",
  technical_question: "Technische Frage",
  legal_question: "Rechtliche Frage",
  objection: "Einwand",
  meeting_request: "Terminanfrage",
  confirmation: "Bestätigung",
  rejection: "Absage",
  ghosting_breaker: "Reaktivierung",
  internal: "Intern",
  spam_noise: "Spam / irrelevant",
};

const SENTIMENT_LABELS: Record<SentimentLabel, string> = {
  positive: "Positiv",
  neutral: "Neutral",
  skeptical: "Skeptisch",
  negative: "Negativ",
};

const STAGE_LABELS: Record<FunnelStage, string> = {
  top_of_funnel: "Top of Funnel",
  mid_funnel: "Mid Funnel",
  bottom_funnel: "Bottom Funnel",
  post_sale: "Post-Sale",
};

const ROLE_LABELS: Record<StakeholderRole, string> = {
  decision_maker: "Entscheider",
  influencer: "Beeinflusser",
  technical_evaluator: "Technischer Prüfer",
  legal_evaluator: "Rechtlicher Prüfer",
  procurement: "Einkauf",
  user: "Anwender",
  blocker: "Blocker",
  unknown: "Unbekannt",
};

const INTENT_OPTIONS = Object.entries(INTENT_LABELS) as [IntentLabel, string][];
const SENTIMENT_OPTIONS = Object.entries(SENTIMENT_LABELS) as [SentimentLabel, string][];
const STAGE_OPTIONS = Object.entries(STAGE_LABELS) as [FunnelStage, string][];
const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [StakeholderRole, string][];

// ── Win probability heuristic ─────────────────────────────────────────────────

function winProbability(c: EmailClassification): number {
  let score = 0.5;
  const sentiment = c.human_sentiment ?? c.ai_sentiment;
  const stage = c.human_funnel_stage ?? c.ai_funnel_stage;
  if (sentiment === "positive") score += 0.2;
  if (sentiment === "negative") score -= 0.25;
  if (sentiment === "skeptical") score -= 0.1;
  if (stage === "bottom_funnel") score += 0.15;
  if (stage === "top_of_funnel") score -= 0.1;
  const concerns = c.concerns?.length ?? 0;
  score -= concerns * 0.05;
  return Math.min(1, Math.max(0, score));
}

// ── Pill components ───────────────────────────────────────────────────────────

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}>
      {children}
    </span>
  );
}

// ── Correction modal ──────────────────────────────────────────────────────────

interface CorrectionModalProps {
  classification: EmailClassification;
  onSave: (data: {
    intent: IntentLabel;
    sentiment: SentimentLabel;
    funnel_stage: FunnelStage;
    stakeholder_role: StakeholderRole;
    note: string;
  }) => Promise<void>;
  onClose: () => void;
}

function CorrectionModal({ classification, onSave, onClose }: CorrectionModalProps) {
  const [intent, setIntent] = useState<IntentLabel>(
    classification.human_intent ?? classification.ai_intent ?? "inquiry"
  );
  const [sentiment, setSentiment] = useState<SentimentLabel>(
    classification.human_sentiment ?? classification.ai_sentiment ?? "neutral"
  );
  const [stage, setStage] = useState<FunnelStage>(
    classification.human_funnel_stage ?? classification.ai_funnel_stage ?? "top_of_funnel"
  );
  const [role, setRole] = useState<StakeholderRole>(
    classification.human_stakeholder_role ?? classification.ai_stakeholder_role ?? "unknown"
  );
  const [note, setNote] = useState(classification.correction_note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ intent, sentiment, funnel_stage: stage, stakeholder_role: role, note });
    setSaving(false);
    onClose();
  }

  const selectCls =
    "w-full px-3 py-2 text-sm rounded-lg border bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:bg-gray-800 dark:border-gray-700 dark:text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl shadow-2xl border bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Klassifikation korrigieren</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Intent</label>
            <select value={intent} onChange={(e) => setIntent(e.target.value as IntentLabel)} className={selectCls}>
              {INTENT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Sentiment</label>
            <select value={sentiment} onChange={(e) => setSentiment(e.target.value as SentimentLabel)} className={selectCls}>
              {SENTIMENT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Funnel Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as FunnelStage)} className={selectCls}>
              {STAGE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Stakeholder-Rolle</label>
            <select value={role} onChange={(e) => setRole(e.target.value as StakeholderRole)} className={selectCls}>
              {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">Notiz (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Warum wurde korrigiert?"
              className={`${selectCls} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
              bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Speichern
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  emailId: string;
  classification: EmailClassification | null;
  classifying: boolean;
  onClassify: () => void;
  onUpdate: (c: EmailClassification) => void;
}

export default function EmailClassificationPanel({
  emailId,
  classification: c,
  classifying,
  onClassify,
  onUpdate,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);

  async function handleConfirm() {
    if (!c) return;
    setConfirming(true);
    const res = await fetch(`/api/emails/${emailId}/classify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: c.ai_intent,
        sentiment: c.ai_sentiment,
        funnel_stage: c.ai_funnel_stage,
        stakeholder_role: c.ai_stakeholder_role,
      }),
    });
    if (res.ok) onUpdate(await res.json());
    setConfirming(false);
  }

  async function handleCorrection(data: {
    intent: IntentLabel;
    sentiment: SentimentLabel;
    funnel_stage: FunnelStage;
    stakeholder_role: StakeholderRole;
    note: string;
  }) {
    const res = await fetch(`/api/emails/${emailId}/classify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) onUpdate(await res.json());
  }

  const intent = c ? (c.human_intent ?? c.ai_intent) : null;
  const sentiment = c ? (c.human_sentiment ?? c.ai_sentiment) : null;
  const stage = c ? (c.human_funnel_stage ?? c.ai_funnel_stage) : null;
  const role = c ? (c.human_stakeholder_role ?? c.ai_stakeholder_role) : null;
  const confidence = c?.ai_confidence ?? null;
  const isCorrected = !!c?.corrected_at;
  const prob = c ? winProbability(c) : null;

  return (
    <>
      {showModal && c && (
        <CorrectionModal
          classification={c}
          onSave={handleCorrection}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="rounded-xl border overflow-hidden bg-white border-purple-200 dark:bg-gray-900 dark:border-purple-500/30">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            {classifying ? (
              <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              AI-Klassifikation
            </span>
            {isCorrected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                Korrigiert
              </span>
            )}
            {confidence !== null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                confidence >= 0.8
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                  : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
              }`}>
                {Math.round(confidence * 100)}% sicher
              </span>
            )}
          </div>

          {!c && !classifying && (
            <button
              onClick={onClassify}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Klassifizieren
            </button>
          )}

          {c && !classifying && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleConfirm}
                disabled={confirming || isCorrected}
                title="KI-Tags als korrekt bestätigen"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                  border border-emerald-300 text-emerald-600 hover:bg-emerald-50
                  dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Bestätigen
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                  border border-gray-200 text-gray-600 hover:bg-gray-50
                  dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Edit3 className="w-3 h-3" />
                Korrigieren
              </button>
              <button
                onClick={onClassify}
                title="Neu klassifizieren"
                className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-500/10 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {classifying && (
          <div className="px-5 pb-5 border-t border-purple-100 dark:border-purple-500/20 pt-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`h-3 rounded bg-purple-100 dark:bg-purple-500/10 animate-pulse ${i === 2 ? "w-2/3" : "w-full"}`} />
            ))}
            <p className="text-xs text-purple-500 dark:text-purple-400 pt-1">KI analysiert die E-Mail...</p>
          </div>
        )}

        {!classifying && c && (
          <div className="px-5 pb-5 border-t border-purple-100 dark:border-purple-500/20 pt-4 space-y-4">
            {/* Low confidence warning */}
            {confidence !== null && confidence < 0.8 && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Unsichere Klassifikation – bitte überprüfen
              </div>
            )}

            {/* Pills */}
            <div className="flex flex-wrap gap-2">
              {intent && (
                <Pill className="bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">
                  {INTENT_LABELS[intent]}
                </Pill>
              )}
              {sentiment && (
                <Pill className={
                  sentiment === "positive" ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" :
                  sentiment === "negative" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30" :
                  sentiment === "skeptical" ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" :
                  "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
                }>
                  {SENTIMENT_LABELS[sentiment]}
                </Pill>
              )}
              {stage && (
                <Pill className="bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                  {STAGE_LABELS[stage]}
                </Pill>
              )}
              {role && (
                <Pill className="bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                  {ROLE_LABELS[role]}
                </Pill>
              )}
            </div>

            {/* Win probability bar */}
            {prob !== null && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Win-Wahrscheinlichkeit</span>
                  <span className={`text-xs font-semibold ${
                    prob > 0.7 ? "text-emerald-600 dark:text-emerald-400" :
                    prob > 0.4 ? "text-amber-600 dark:text-amber-400" :
                    "text-red-600 dark:text-red-400"
                  }`}>
                    {Math.round(prob * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      prob > 0.7 ? "bg-emerald-500" :
                      prob > 0.4 ? "bg-amber-500" :
                      "bg-red-500"
                    }`}
                    style={{ width: `${Math.round(prob * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Signals table */}
            {(c.detected_use_case || c.detected_industry || c.deal_size_signal || c.timeline_signal || c.concerns?.length || c.response_time_hours) && (
              <div className="rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {c.detected_use_case && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium w-1/3">Use Case</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{c.detected_use_case.replace(/_/g, " ")}</td>
                      </tr>
                    )}
                    {c.detected_industry && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Branche</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{c.detected_industry.replace(/_/g, " ")}</td>
                      </tr>
                    )}
                    {c.deal_size_signal && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Deal-Größe</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{c.deal_size_signal}</td>
                      </tr>
                    )}
                    {c.timeline_signal && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Timeline</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{c.timeline_signal}</td>
                      </tr>
                    )}
                    {!!c.concerns?.length && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Bedenken</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{c.concerns.join(", ")}</td>
                      </tr>
                    )}
                    {c.response_time_hours !== null && c.response_time_hours !== undefined && (
                      <tr>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Antwortzeit</td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                          {c.response_time_hours < 24
                            ? `${c.response_time_hours} Std.`
                            : `${Math.round(c.response_time_hours / 24)} Tage`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reasoning */}
            {c.ai_reasoning && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed">
                {c.ai_reasoning}
              </p>
            )}
          </div>
        )}

        {!classifying && !c && (
          <div className="px-5 pb-5 border-t border-purple-100 dark:border-purple-500/20 pt-4">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Noch keine KI-Klassifikation. Klicke auf „Klassifizieren".
            </p>
          </div>
        )}
      </div>
    </>
  );
}
