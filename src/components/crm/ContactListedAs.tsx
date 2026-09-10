"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Building2, UserRound, Mail, Phone, Briefcase } from "lucide-react";
import CallButton from "@/components/CallButton";
import type { PhoneEntry } from "@/types/crm";

type ListedAsEntry = {
  contact_id: string;
  contact_type: "natural_person" | "legal_entity";
  contact_label: string;
  position: string | null;
  email: string | null;
  phones: PhoneEntry[];
};

const PHONE_LABEL: Record<string, string> = {
  mobile: "Mobil",
  landline: "Festnetz",
  fax: "Fax",
  other: "Sonstige",
};

// Zeigt, bei welchen anderen Kontakten die aktuelle Person als Ansprechpartner
// geführt wird – mit der dort hinterlegten Funktion und den Kontaktdaten.
export default function ContactListedAs({ contactId }: { contactId: string }) {
  const [entries, setEntries] = useState<ListedAsEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/contacts/${contactId}/listed-as`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active) setEntries(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contactId]);

  // Nichts anzeigen, solange geladen wird oder keine Treffer vorliegen.
  if (loading || entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
        <Link2 className="w-4 h-4 text-gray-400" />
        Gelistet als Ansprechpartner bei ({entries.length})
      </h3>

      <div className="space-y-3">
        {entries.map((e) => (
          <div
            key={e.contact_id}
            className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 space-y-1"
          >
            <Link
              href={`/kontakte/${e.contact_id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400"
            >
              {e.contact_type === "legal_entity"
                ? <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                : <UserRound className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
              <span className="truncate">{e.contact_label}</span>
            </Link>

            {e.position && (
              <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {e.position}
              </p>
            )}

            {e.email && (
              <a
                href={`mailto:${e.email}`}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400"
              >
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                {e.email}
              </a>
            )}

            {e.phones.filter((p) => p.value).map((ph, j) => (
              <div key={j} className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <a
                  href={`tel:${ph.value}`}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400"
                >
                  {ph.value}
                </a>
                <span className="text-xs text-gray-300 dark:text-gray-600">
                  {PHONE_LABEL[ph.type] ?? ph.type}
                </span>
                <CallButton phoneNumber={ph.value} contactId={contactId} compact />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
