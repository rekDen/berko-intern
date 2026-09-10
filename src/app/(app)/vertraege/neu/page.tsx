"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Combobox from "@/components/Combobox";
import { fetchAllContacts } from "@/lib/fetch-all-contacts";
import { contactDisplayName } from "@/types/crm";

type ContactOption = {
  id: string;
  type: "natural_person" | "legal_entity";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type DealOption = {
  id: string;
  title: string | null;
  contact_id: string | null;
};

export default function ContractCreatePageWrapper() {
  return (
    <Suspense fallback={null}>
      <ContractCreatePage />
    </Suspense>
  );
}

function ContractCreatePage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [error, setError] = useState("");

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");

  useEffect(() => {
    Promise.all([
      fetchAllContacts<ContactOption>(),
      fetch("/api/deals").then((r) => (r.ok ? r.json() : [])),
    ]).then(([c, d]) => {
      setContacts(c);
      setDeals(d);
    });
  }, []);

  function handleDealChange(id: string) {
    setDealId(id);
    if (id && !contactId) {
      const deal = deals.find((d) => d.id === id);
      if (deal?.contact_id) setContactId(deal.contact_id);
    }
  }

  async function handleSaveWithPdf() {
    setPdfSaving(true);
    setError("");

    try {
      // 1. Extract form data from the template iframe
      let contractData: Record<string, unknown> | null = null;
      let derivedTitle: string | null = null;
      let derivedNotes: string | null = null;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = iframeRef.current?.contentWindow as any;
        if (typeof win?.triggerJsonExport === "function") {
          contractData = await win.triggerJsonExport();
        } else if (typeof win?.readContractFields === "function") {
          contractData = win.readContractFields();
        }
      } catch (e) {
        console.warn("Formulardaten konnten nicht ausgelesen werden:", e);
      }

      // Smart field extraction — try common key variants
      if (contractData) {
        const pick = (...keys: string[]): string | null => {
          for (const k of keys) {
            const v = (contractData as Record<string, unknown>)[k];
            if (typeof v === "string" && v.trim()) return v.trim();
          }
          return null;
        };

        const firma = pick("Firma", "firma", "Unternehmen", "company", "Auftraggeber", "client");
        const paket = pick("Paket", "paket", "package", "Package", "Plan");
        const sonder = pick("Sonderwünsche", "sonderwuensche", "Sonderwünsche / Anmerkungen",
          "special_requests", "notes", "Anmerkungen");

        derivedTitle = firma
          ? `KI-Software-Vertrag – ${firma}${paket ? ` (${paket})` : ""}`
          : paket ? `KI-Software-Vertrag – ${paket}` : "KI-Software-Vertrag";
        derivedNotes = sonder;
      }

      // 2. Create contract record
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_status: "won",
          contact_id: contactId || null,
          title: derivedTitle ?? "KI-Software-Vertrag",
          notes: derivedNotes,
          contract_data: contractData,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler beim Speichern" }));
        setError(err.error);
        return;
      }

      const { id: newContractId } = await res.json();

      try {
        const pdfRes = await fetch("/api/generate-pdf", { method: "POST" });
        if (!pdfRes.ok) {
          const body = await pdfRes.json().catch(() => ({}));
          throw new Error(body.error ?? `PDF-API ${pdfRes.status}`);
        }
        const pdfBlob = await pdfRes.blob();
        if (pdfBlob.size === 0) throw new Error("PDF ist leer (0 Bytes)");

        const supabase = createClient();
        const fileName = `Vertrag_${Date.now()}.pdf`;
        const storagePath = `contracts/${newContractId}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("documents")
          .upload(storagePath, pdfBlob, { contentType: "application/pdf" });

        if (uploadErr) throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);

        let categoryId: string | null = null;
        const catRes = await fetch("/api/document-categories");
        if (catRes.ok) {
          const allCats: { id: string; code: string; level: string }[] = await catRes.json();
          const contractCats = allCats.filter((c) => c.level === "contract" && c.code.includes("."));
          const defaultCat =
            contractCats.find((c) => c.code === "VERTRAG_KORRESPONDENZ.ALLGEMEIN") ??
            contractCats[0];
          categoryId = defaultCat?.id ?? null;
        }

        const docRes = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: categoryId,
            level: "contract",
            contract_id: newContractId,
            title: "KI-Software-Vertrag",
            storage_path: storagePath,
            file_name: fileName,
            file_size: pdfBlob.size,
            mime_type: "application/pdf",
          }),
        });
        if (!docRes.ok) {
          const body = await docRes.json().catch(() => ({}));
          throw new Error(`Dokument-Speicherung fehlgeschlagen: ${body.error ?? docRes.status}`);
        }
      } catch (pdfErr) {
        const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        console.error("PDF/Dokument fehlgeschlagen:", msg);
        setError(`PDF/Dokument: ${msg}`);
      }

      router.push(`/vertraege/${newContractId}`);
    } finally {
      setPdfSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 bg-slate-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto">
        {/* Topbar */}
        <div className="flex items-center justify-between mb-6">
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Link href="/vertraege" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Verträge
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 dark:text-gray-300">Neuer Vertrag</span>
          </nav>

          <div className="flex items-center gap-3">
            {error && <p className="text-sm text-red-500 max-w-xs text-right">{error}</p>}
            <button
              type="button"
              onClick={handleSaveWithPdf}
              disabled={pdfSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pdfSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {pdfSaving ? "Wird gespeichert…" : "Als PDF speichern"}
            </button>
            <Link
              href="/vertraege"
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              Abbrechen
            </Link>
          </div>
        </div>

        {/* Zuordnung */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">Zuordnung</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Kontakt
              </label>
              <Combobox
                value={contactId}
                onChange={setContactId}
                options={contacts.map((c) => ({ value: c.id, label: contactDisplayName(c) }))}
                placeholder="Kontakt suchen…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Deal
              </label>
              <Combobox
                value={dealId}
                onChange={handleDealChange}
                options={deals.map((d) => ({
                  value: d.id,
                  label: d.title ?? "Ohne Titel",
                }))}
                placeholder="Deal suchen…"
              />
            </div>
          </div>
        </div>

        {/* Vertragsvorlage */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
          <iframe
            ref={iframeRef}
            src="/api/contract-template"
            className="w-full"
            style={{ height: "calc(100vh - 240px)", border: "none" }}
            title="Vertragsvorlage"
          />
        </div>
      </div>
    </div>
  );
}
