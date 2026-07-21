"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, ExternalLink, Link2 } from "lucide-react";

type QuickLink = { id: string; url: string; label: string };

const KEY = "tls-quick-links";

function hostOf(raw: string): string {
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch { return raw; }
}

function normalize(url: string): string {
  if (!url.match(/^https?:\/\//)) return `https://${url}`;
  return url;
}

export function QuickLinks() {
  const [links, setLinks]       = useState<QuickLink[]>([]);
  const [adding, setAdding]     = useState(false);
  const [url, setUrl]           = useState("");
  const [label, setLabel]       = useState("");
  const [editId, setEditId]     = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setLinks(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch {}
  }, []);

  function persist(next: QuickLink[]) {
    setLinks(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function add() {
    const raw = url.trim();
    if (!raw) return;
    const full = normalize(raw);
    const name = label.trim() || hostOf(full);
    persist([{ id: crypto.randomUUID(), url: full, label: name }, ...links]);
    setUrl(""); setLabel(""); setAdding(false);
  }

  function remove(id: string) {
    persist(links.filter((l) => l.id !== id));
  }

  function saveEdit(id: string) {
    const t = editLabel.trim();
    if (t) persist(links.map((l) => l.id === id ? { ...l, label: t } : l));
    setEditId(null); setEditLabel("");
  }

  function startAdding() {
    setAdding(true);
    setTimeout(() => urlRef.current?.focus(), 0);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Quick Links</h2>
        <button
          onClick={startAdding}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Add link"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-zinc-800 space-y-2 shrink-0">
          <input
            ref={urlRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setUrl(""); setLabel(""); } }}
            placeholder="Paste URL…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setUrl(""); setLabel(""); } }}
            placeholder="Label (optional — defaults to hostname)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <div className="flex gap-2">
            <button onClick={add} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
            <button onClick={() => { setAdding(false); setUrl(""); setLabel(""); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800 min-h-0">
        {links.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-10 px-4 gap-2 text-center">
            <Link2 className="h-5 w-5 text-zinc-700" />
            <p className="text-xs text-zinc-600">No links yet — paste one above</p>
          </div>
        )}
        {links.map((link) => (
          <div key={link.id} className="group flex items-center gap-2.5 px-4 py-3">
            <img
              src={`https://www.google.com/s2/favicons?sz=16&domain=${link.url}`}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 opacity-70"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="flex-1 min-w-0">
              {editId === link.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={() => saveEdit(link.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(link.id); if (e.key === "Escape") { setEditId(null); setEditLabel(""); } }}
                  className="w-full bg-zinc-800 rounded px-2 py-0.5 text-sm text-zinc-100 outline-none border border-zinc-600"
                />
              ) : (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-zinc-300 hover:text-zinc-100 truncate transition-colors"
                  title={link.url}
                >
                  {link.label}
                </a>
              )}
              <p className="text-[10px] text-zinc-600 truncate mt-0.5">{hostOf(link.url)}</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => { setEditId(link.id); setEditLabel(link.label); }}
                className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
                title="Rename"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2l2 2-6 6H2v-2l6-6z" />
                </svg>
              </button>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
                title="Open"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
              <button
                onClick={() => remove(link.id)}
                className="text-zinc-600 hover:text-red-400 transition-colors p-0.5"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
