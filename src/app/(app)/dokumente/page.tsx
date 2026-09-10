"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Folder,
  File,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Pencil,
  ChevronRight,
  Loader2,
  FolderOpen,
} from "lucide-react";

type FolderItem = { name: string };
type FileItem = {
  name: string;
  size: number;
  contentType: string;
  updatedAt: string;
  storagePath: string;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE");
}

const inputCls =
  "text-sm rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-gray-900 dark:border-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30";

function DokumentePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const path = searchParams.get("path") ?? "";

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/dokumente?path=${encodeURIComponent(path)}`);
    if (res.ok) {
      const data = await res.json();
      setFolders(data.folders ?? []);
      setFiles(data.files ?? []);
    }
    setLoading(false);
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  const breadcrumbs = path ? path.split("/").filter(Boolean) : [];

  function navigateTo(segments: string[]) {
    const p = segments.join("/");
    router.push(p ? `/dokumente?path=${encodeURIComponent(p)}` : "/dokumente");
  }

  function enterFolder(folderName: string) {
    navigateTo([...breadcrumbs, folderName]);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await fetch("/api/dokumente/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path ? `${path}/${name}` : name }),
    });
    setNewFolderMode(false);
    setNewFolderName("");
    load();
  }

  function startRename(folderName: string) {
    setRenamingFolder(folderName);
    setRenameValue(folderName);
  }

  async function commitRename(folderName: string) {
    const newName = renameValue.trim();
    setRenamingFolder(null);
    if (!newName || newName === folderName) return;
    await fetch("/api/dokumente/folder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldPath: path ? `${path}/${folderName}` : folderName,
        newPath: path ? `${path}/${newName}` : newName,
      }),
    });
    load();
  }

  async function handleDeleteFolder(folderName: string) {
    if (!confirm(`Ordner "${folderName}" und alle Inhalte wirklich löschen?`)) return;
    await fetch(
      `/api/dokumente?path=${encodeURIComponent(path ? `${path}/${folderName}` : folderName)}&type=folder`,
      { method: "DELETE" }
    );
    load();
  }

  async function handleDeleteFile(file: FileItem) {
    if (!confirm(`Datei "${file.name}" wirklich löschen?`)) return;
    await fetch(`/api/dokumente?path=${encodeURIComponent(file.storagePath)}&type=file`, {
      method: "DELETE",
    });
    load();
  }

  async function handleDownload(file: FileItem) {
    const res = await fetch(`/api/dokumente/download?path=${encodeURIComponent(file.storagePath)}`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function uploadFiles(fileList: File[], basePath: string) {
    const supabase = createClient();
    await Promise.all(
      fileList.map((file) =>
        supabase.storage
          .from("documents")
          .upload(`dokumente/${basePath ? basePath + "/" : ""}${file.name}`, file, { upsert: true })
      )
    );
  }

  // Recursive helper: walks a FileSystemEntry tree and uploads everything
  async function processEntry(
    entry: FileSystemEntry,
    basePath: string,
    supabase: ReturnType<typeof createClient>
  ): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve) => fileEntry.file(resolve));
      const storagePath = `dokumente/${basePath ? basePath + "/" : ""}${entry.name}`;
      await supabase.storage.from("documents").upload(storagePath, file, { upsert: true });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const subBase = basePath ? `${basePath}/${entry.name}` : entry.name;

      // Ensure folder exists (creates .keep placeholder)
      await fetch("/api/dokumente/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: subBase }),
      });

      // readEntries only returns ≤100 items per call — loop until exhausted
      const reader = dirEntry.createReader();
      const allEntries: FileSystemEntry[] = [];
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise((resolve) => reader.readEntries(resolve));
        allEntries.push(...batch);
      } while (batch.length > 0);

      await Promise.all(allEntries.map((sub) => processEntry(sub, subBase, supabase)));
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    setUploading(true);

    const supabase = createClient();
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);

    if (entries.length > 0) {
      await Promise.all(entries.map((entry) => processEntry(entry, path, supabase)));
    } else {
      // Fallback for browsers without webkitGetAsEntry
      const fallbackFiles = Array.from(e.dataTransfer.files);
      await uploadFiles(fallbackFiles, path);
    }

    setUploading(false);
    load();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    if (dragDepth.current === 1) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current === 0) setDragOver(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setUploading(true);
    await uploadFiles(selected, path);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  }

  const isEmpty = !loading && folders.length === 0 && files.length === 0 && !newFolderMode;

  return (
    <div
      className="relative min-h-screen px-6 py-8 max-w-5xl mx-auto bg-slate-50 dark:bg-gray-950"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Full-page drag overlay */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-4
          bg-indigo-500/10 dark:bg-indigo-500/15 border-4 border-dashed border-indigo-500 rounded-xl m-2">
          <Upload className="w-12 h-12 text-indigo-500" />
          <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
            Dateien & Ordner hier ablegen
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-1.5 flex-wrap text-sm">
          <button
            onClick={() => navigateTo([])}
            className="font-semibold text-gray-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
          >
            Dokumente
          </button>
          {breadcrumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              <button
                onClick={() => navigateTo(breadcrumbs.slice(0, i + 1))}
                className={
                  i === breadcrumbs.length - 1
                    ? "font-medium text-gray-700 dark:text-gray-300"
                    : "text-gray-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                }
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setNewFolderMode(true); setNewFolderName(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            Neuer Ordner
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Wird hochgeladen…" : "Datei hochladen"}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500">
          <FolderOpen className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium mb-1">Noch keine Dateien oder Ordner</p>
          <p className="text-xs">Dateien oder Ordner hier hineinziehen oder oben hochladen</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
          {newFolderMode && (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-indigo-50 dark:bg-indigo-500/5">
              <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setNewFolderMode(false); setNewFolderName(""); }
                }}
                onBlur={() => { if (!newFolderName.trim()) setNewFolderMode(false); }}
                placeholder="Ordnername…"
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={handleCreateFolder}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Erstellen
              </button>
              <button
                onClick={() => { setNewFolderMode(false); setNewFolderName(""); }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          )}

          {folders.map((folder) => (
            <div
              key={folder.name}
              className="group flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
              {renamingFolder === folder.name ? (
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(folder.name);
                    if (e.key === "Escape") setRenamingFolder(null);
                  }}
                  onBlur={() => commitRename(folder.name)}
                  className={`${inputCls} flex-1`}
                />
              ) : (
                <button
                  onClick={() => enterFolder(folder.name)}
                  className="flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                >
                  {folder.name}
                </button>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startRename(folder.name)}
                  title="Umbenennen"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteFolder(folder.name)}
                  title="Löschen"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {files.map((file) => (
            <div
              key={file.name}
              className="group flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{file.name}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">{formatBytes(file.size)}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap hidden md:block">{formatDate(file.updatedAt)}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(file)}
                  title="Herunterladen"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-500/10 dark:hover:text-orange-400 transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteFile(file)}
                  title="Löschen"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DokumentePageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      }
    >
      <DokumentePage />
    </Suspense>
  );
}
