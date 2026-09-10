"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Plus, Loader2, Users, Send, Eye, Ban } from "lucide-react";
import type { NewsletterCampaign, CampaignStatus } from "@/types/newsletter";

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Entwurf", scheduled: "Geplant", sending: "Wird gesendet",
  paused: "Pausiert", sent: "Versendet", failed: "Fehler",
};
const STATUS_CLS: Record<CampaignStatus, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  scheduled: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  sending: "bg-berko-100 text-berko-700 dark:bg-berko-500/10 dark:text-berko-300",
  paused: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export default function NewsletterPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/newsletter/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  async function createCampaign() {
    const name = prompt("Name der Kampagne?");
    if (!name?.trim()) return;
    setCreating(true);
    const res = await fetch("/api/newsletter/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const c = await res.json();
      router.push(`/newsletter/${c.id}`);
    } else {
      alert("Konnte nicht erstellt werden.");
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Mail className="w-5 h-5 text-berko" /> Newsletter
        </h1>
        <button
          onClick={createCampaign}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-berko text-white hover:bg-berko-dark transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Neue Kampagne
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Noch keine Kampagnen. Lege deine erste Newsletter-Kampagne an.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/newsletter/${c.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 hover:border-berko/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white truncate">{c.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CLS[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{c.subject || "— kein Betreff —"}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                <span className="flex items-center gap-1" title="Empfänger"><Users className="w-3.5 h-3.5" />{c.total_recipients}</span>
                <span className="flex items-center gap-1" title="Versendet"><Send className="w-3.5 h-3.5" />{c.sent_count}</span>
                <span className="flex items-center gap-1" title="Geöffnet"><Eye className="w-3.5 h-3.5" />{c.opened_count}</span>
                <span className="flex items-center gap-1" title="Abgemeldet"><Ban className="w-3.5 h-3.5" />{c.unsubscribed_count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
