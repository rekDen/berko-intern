"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug, Sparkles, Plus, List, LayoutGrid, Search, X, Loader2,
  Trash2, Pencil, Paperclip, Upload, FileIcon, Image as ImageIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

type ItemType = "bug" | "feature";
type ItemStatus = "backlog" | "on_hold" | "in_progress" | "review" | "done" | "rejected";

type Attachment = { name: string; url: string; size: number; mime_type: string; path: string };

type BugFeatureItem = {
  id: string;
  title: string;
  description: string | null;
  type: ItemType;
  status: ItemStatus;
  attachments: Attachment[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type TeamMember = { id: string; name: string };

// ─── Status config ────────────────────────────────────────────

const STATUSES: {
  value: ItemStatus; label: string;
  badge: string; border: string; dot: string;
}[] = [
  { value: "backlog",     label: "Backlog",         badge: "bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-400",       border: "border-t-gray-400 dark:border-t-gray-500",       dot: "bg-gray-400" },
  { value: "on_hold",     label: "On Hold",          badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",    border: "border-t-amber-400 dark:border-t-amber-500",      dot: "bg-amber-400" },
  { value: "in_progress", label: "In Bearbeitung",   badge: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",       border: "border-t-blue-400 dark:border-t-blue-500",        dot: "bg-blue-400" },
  { value: "review",      label: "Review",           badge: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400", border: "border-t-violet-400 dark:border-t-violet-500",   dot: "bg-violet-400" },
  { value: "done",        label: "Abgeschlossen",    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400", border: "border-t-emerald-400 dark:border-t-emerald-500", dot: "bg-emerald-400" },
  { value: "rejected",    label: "Abgelehnt",        badge: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",           border: "border-t-red-400 dark:border-t-red-500",          dot: "bg-red-400" },
];

const statusByValue = Object.fromEntries(STATUSES.map((s) => [s.value, s])) as Record<ItemStatus, typeof STATUSES[0]>;

// ─── Helpers ─────────────────────────────────────────────────

function TypeBadge({ type, size = "sm" }: { type: ItemType; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  if (type === "bug") return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400 ${cls}`}>
      <Bug className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />Bug
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 ${cls}`}>
      <Sparkles className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />Feature
    </span>
  );
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(mime: string) { return mime.startsWith("image/"); }

// ─── Kanban card ─────────────────────────────────────────────

function ItemCard({ item, teamMap, onEdit, onDelete, onDragStart, isDragging }: {
  item: BugFeatureItem;
  teamMap: Record<string, string>;
  onEdit: (item: BugFeatureItem) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(item.id); }}
      onClick={() => onEdit(item)}
      className={`rounded-lg border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700
        p-3 cursor-pointer select-none transition-all group
        hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600
        ${isDragging ? "opacity-40 rotate-1 shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <TypeBadge type={item.type} size="xs" />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onEdit(item)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => onDelete(item.id)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-tight mb-1">
        {item.title}
      </p>
      {item.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{item.description}</p>
      )}
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
        <span>{teamMap[item.created_by ?? ""] ?? "–"}</span>
        <div className="flex items-center gap-2">
          {item.attachments.length > 0 && (
            <span className="flex items-center gap-0.5"><Paperclip className="w-2.5 h-2.5" />{item.attachments.length}</span>
          )}
          <span>{new Date(item.created_at).toLocaleDateString("de-DE")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────

function KanbanColumn({ status, items, teamMap, draggedId, onDragStart, onDrop, onAdd, onEdit, onDelete }: {
  status: ItemStatus; items: BugFeatureItem[]; teamMap: Record<string, string>;
  draggedId: string | null; onDragStart: (id: string) => void; onDrop: (s: ItemStatus) => void;
  onAdd: (s: ItemStatus) => void; onEdit: (item: BugFeatureItem) => void; onDelete: (id: string) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const cfg = statusByValue[status];
  return (
    <div className="flex flex-col flex-shrink-0 w-60">
      <div className={`rounded-t-xl border-t-2 border-x border-b-0 px-3 py-2.5 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 ${cfg.border}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{cfg.label}</span>
            {items.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 leading-none">{items.length}</span>
            )}
          </div>
          <button onClick={() => onAdd(status)} className="p-0.5 rounded text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsOver(false); onDrop(status); }}
        className={`flex-1 min-h-32 rounded-b-xl border border-t-0 px-2 py-2 space-y-2 transition-colors
          ${isOver && draggedId !== null
            ? "bg-orange-50 border-orange-300 dark:bg-orange-500/10 dark:border-orange-500/40"
            : "bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700"}`}
      >
        {items.map((item) => (
          <ItemCard key={item.id} item={item} teamMap={teamMap} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} isDragging={draggedId === item.id} />
        ))}
        {items.length === 0 && !isOver && <p className="text-xs text-gray-300 dark:text-gray-600 text-center pt-4">–</p>}
        {isOver && draggedId !== null && (
          <div className="h-8 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-500/50 flex items-center justify-center">
            <span className="text-xs text-orange-400">Hier ablegen</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────

type ModalMode = { mode: "create"; initialStatus: ItemStatus } | { mode: "edit"; item: BugFeatureItem };

function ItemModal({ modalMode, onClose, onSaved }: {
  modalMode: ModalMode; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = modalMode.mode === "edit";
  const existing = isEdit ? modalMode.item : null;

  const [type, setType] = useState<ItemType>(existing?.type ?? "feature");
  const [status, setStatus] = useState<ItemStatus>(isEdit ? existing!.status : modalMode.initialStatus);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePending(i: number) {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function removeAttachment(att: Attachment) {
    if (!existing) return;
    await fetch(`/api/bug-features/${existing.id}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: att.path }),
    });
    setAttachments((prev) => prev.filter((a) => a.path !== att.path));
  }

  async function handleSave() {
    if (!title.trim()) { setError("Titel ist erforderlich"); return; }
    setError(""); setSaving(true);

    let itemId = existing?.id;

    if (isEdit) {
      const res = await fetch(`/api/bug-features/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description || null, type, status }),
      });
      if (!res.ok) { setError("Fehler beim Speichern"); setSaving(false); return; }
    } else {
      const res = await fetch("/api/bug-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description || null, type, status }),
      });
      if (!res.ok) { setError("Fehler beim Erstellen"); setSaving(false); return; }
      const data = await res.json();
      itemId = data.id;
    }

    // Upload pending files
    if (pendingFiles.length > 0 && itemId) {
      setUploading(true);
      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append("file", file);
        await fetch(`/api/bug-features/${itemId}/attachments`, { method: "POST", body: fd });
      }
      setUploading(false);
    }

    setSaving(false);
    onSaved();
  }

  const inputCls = "w-full text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Eintrag bearbeiten" : "Neuer Eintrag"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(["feature", "bug"] as ItemType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  type === t
                    ? t === "bug" ? "bg-red-500 text-white" : "bg-indigo-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}>
                {t === "bug" ? <Bug className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {t === "bug" ? "Bug" : "Feature"}
              </button>
            ))}
          </div>

          {/* Stage */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Stage</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)} className={inputCls}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Titel *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kurze Beschreibung" className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Beschreibung</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Detaillierte Beschreibung des Bugs oder Features…" className={inputCls} />
          </div>

          {/* Existing attachments */}
          {attachments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Anhänge</label>
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div key={att.path} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    {isImage(att.mime_type) ? <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">{att.name}</a>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtSize(att.size)}</span>
                    <button onClick={() => removeAttachment(att)} className="p-0.5 rounded text-gray-400 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Neue Dateien (wird beim Speichern hochgeladen)</label>
              <div className="space-y-1.5">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-500/5">
                    {isImage(f.type) ? <ImageIcon className="w-4 h-4 text-orange-400 flex-shrink-0" /> : <FileIcon className="w-4 h-4 text-orange-400 flex-shrink-0" />}
                    <span className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtSize(f.size)}</span>
                    <button onClick={() => removePending(i)} className="p-0.5 rounded text-gray-400 hover:text-red-500 flex-shrink-0"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600 cursor-pointer transition-colors"
          >
            <Upload className="w-5 h-5 text-gray-400" />
            <p className="text-xs text-gray-400">Dateien hierher ziehen oder <span className="text-orange-600 dark:text-orange-400">auswählen</span></p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={saving || uploading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50">
            {(saving || uploading) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {uploading ? "Lade hoch…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────

export default function BugsFeaturesPage() {
  const [items, setItems] = useState<BugFeatureItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | ItemType>("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  const teamMap = useMemo(() => Object.fromEntries(team.map((m) => [m.id, m.name])), [team]);

  const load = useCallback(async () => {
    setLoading(true);
    const [itemsRes, teamRes] = await Promise.all([
      fetch("/api/bug-features").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
    ]);
    setItems(itemsRes);
    setTeam(teamRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const saved = localStorage.getItem("bugs-features-view");
    if (saved === "kanban" || saved === "table") setView(saved);
  }, []);

  function switchView(v: "kanban" | "table") {
    setView(v);
    localStorage.setItem("bugs-features-view", v);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (q && !`${item.title} ${item.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, typeFilter]);

  const byStatus = useMemo(() => {
    const map = {} as Record<ItemStatus, BugFeatureItem[]>;
    for (const s of STATUSES) map[s.value] = [];
    for (const item of filtered) map[item.status]?.push(item);
    return map;
  }, [filtered]);

  async function handleDelete(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const res = await fetch(`/api/bug-features/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleDragStart(id: string) { setDraggedId(id); draggedIdRef.current = id; }

  function handleDrop(targetStatus: ItemStatus) {
    const id = draggedIdRef.current;
    if (!id) return;
    const item = items.find((i) => i.id === id);
    if (!item || item.status === targetStatus) { setDraggedId(null); draggedIdRef.current = null; return; }
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: targetStatus } : i));
    setDraggedId(null); draggedIdRef.current = null;
    fetch(`/api/bug-features/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    });
  }

  function openCreate(initialStatus: ItemStatus = "backlog") {
    setModalMode({ mode: "create", initialStatus });
  }

  function openEdit(item: BugFeatureItem) {
    setModalMode({ mode: "edit", item });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950" onDragEnd={() => { setDraggedId(null); draggedIdRef.current = null; }}>
      <div className="px-6 pt-8 pb-4 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Bug className="w-6 h-6 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bugs / Features</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 gap-0.5">
              <button onClick={() => switchView("kanban")} title="Kanban" className={`p-2 rounded-lg transition-colors ${view === "kanban" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => switchView("table")} title="Tabelle" className={`p-2 rounded-lg transition-colors ${view === "table" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => openCreate()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
              <Plus className="w-4 h-4" /> Neuer Eintrag
            </button>
          </div>
        </div>

        {/* Search + type filter */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Titel oder Beschreibung…"
              className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex gap-1.5">
            {([["", "Alle"], ["bug", "Bugs"], ["feature", "Features"]] as [string, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setTypeFilter(v as "" | ItemType)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  typeFilter === v ? "bg-orange-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : view === "kanban" ? (
        <div className="px-6 pb-8 overflow-x-auto">
          <div className="flex gap-3 min-w-max pt-1">
            {STATUSES.map((s) => (
              <KanbanColumn
                key={s.value}
                status={s.value}
                items={byStatus[s.value]}
                teamMap={teamMap}
                draggedId={draggedId}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onAdd={openCreate}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-6 pb-8 max-w-[1600px] mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
              <Bug className="w-12 h-12 mb-3" />
              <p className="text-sm">Keine Einträge gefunden</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Typ</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Status</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400">Titel</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden lg:table-cell">Beschreibung</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Anhänge</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden md:table-cell">Erstellt von</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-gray-400 hidden sm:table-cell">Erstellt am</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const cfg = statusByValue[item.status];
                    return (
                      <tr key={item.id} className="group border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                        <td className="px-4 py-2.5"><TypeBadge type={item.type} /></td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.badge}`}>{cfg.label}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => openEdit(item)} className="font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400 text-left">
                            {item.title}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-xs">
                          <span className="line-clamp-1">{item.description ?? "–"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          {item.attachments.length > 0 ? (
                            <span className="flex items-center gap-1 text-xs"><Paperclip className="w-3.5 h-3.5" />{item.attachments.length}</span>
                          ) : "–"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell text-xs whitespace-nowrap">
                          {teamMap[item.created_by ?? ""] ?? "–"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell text-xs whitespace-nowrap">
                          {new Date(item.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <ItemModal
          modalMode={modalMode}
          onClose={() => setModalMode(null)}
          onSaved={() => { setModalMode(null); load(); }}
        />
      )}
    </div>
  );
}
