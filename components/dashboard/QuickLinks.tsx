"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, Check, Copy, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  label: string;
  url: string;
  created_at: string;
};

function looksLikeUrl(s: string) {
  return /^https?:\/\//i.test(s) || /^www\./i.test(s);
}
function toHref(s: string) {
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function QuickLinks({ userId }: { userId: string }) {
  const [items, setItems]       = useState<Item[]>([]);
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState("");
  const [newValue, setNewValue] = useState("");
  const [editId, setEditId]     = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [copied, setCopied]     = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const db = supabase as any;

  useEffect(() => {
    db.from("dashboard_links")
      .select("id, label, url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => { if (data) setItems(data); });

    const ch = db
      .channel("dashboard-links")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "dashboard_links",
        filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if (p.eventType === "INSERT")      setItems((s) => s.find((i) => i.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setItems((s) => s.map((i) => i.id === p.new.id ? p.new : i));
        else if (p.eventType === "DELETE") setItems((s) => s.filter((i) => i.id !== p.old.id));
      })
      .subscribe();

    return () => { db.removeChannel(ch); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!newName.trim()) return;
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: Item = { id, label: newName.trim(), url: newValue.trim(), created_at: now };
    setItems((s) => [item, ...s]);
    setAdding(false); setNewName(""); setNewValue("");
    await db.from("dashboard_links").insert({ ...item, user_id: userId });
  }

  async function remove(id: string) {
    setItems((s) => s.filter((i) => i.id !== id));
    await db.from("dashboard_links").delete().eq("id", id);
  }

  async function saveEdit() {
    if (!editId) return;
    const patch = { label: editName.trim(), url: editValue.trim() };
    setItems((s) => s.map((i) => i.id === editId ? { ...i, ...patch } : i));
    const id = editId;
    setEditId(null); setEditName(""); setEditValue("");
    await db.from("dashboard_links").update(patch).eq("id", id);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function startAdding() {
    setAdding(true);
    setEditId(null);
    setTimeout(() => nameRef.current?.focus(), 0);
  }

  function startEdit(item: Item) {
    setEditId(item.id);
    setEditName(item.label);
    setEditValue(item.url);
    setAdding(false);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Quick Links</h2>
        <button onClick={startAdding} className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Add field">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-4 py-3 border-b border-zinc-800 space-y-2 shrink-0">
          <input
            ref={nameRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") { setAdding(false); setNewName(""); setNewValue(""); }
            }}
            placeholder="Name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") { setAdding(false); setNewName(""); setNewValue(""); }
            }}
            placeholder="Value"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <div className="flex gap-2">
            <button onClick={add} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
            <button onClick={() => { setAdding(false); setNewName(""); setNewValue(""); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800">
        {items.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
            <p className="text-xs text-zinc-600">No fields yet</p>
            <button onClick={startAdding} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
              <Plus className="h-3 w-3" /> Add field
            </button>
          </div>
        )}
        {items.map((item) =>
          editId === item.id ? (
            <div key={item.id} className="px-4 py-3 space-y-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
              />
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditId(null); } }}
                placeholder="Value"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
                <button onClick={() => { setEditId(null); setEditName(""); setEditValue(""); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <div key={item.id} className="group flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">{item.label}</p>
                {looksLikeUrl(item.url) ? (
                  <a href={toHref(item.url)} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-zinc-300 hover:text-zinc-100 truncate block transition-colors">
                    {item.url}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-300 truncate">{item.url || <span className="text-zinc-600 italic">—</span>}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {item.url && (
                  <button onClick={() => copy(item.url, item.id)} title="Copy value"
                    className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                    {copied === item.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
                {looksLikeUrl(item.url) && (
                  <a href={toHref(item.url)} target="_blank" rel="noopener noreferrer" title="Open"
                    className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button onClick={() => startEdit(item)} title="Edit"
                  className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 2l2 2-6 6H2v-2l6-6z" />
                  </svg>
                </button>
                <button onClick={() => remove(item.id)} title="Remove"
                  className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
