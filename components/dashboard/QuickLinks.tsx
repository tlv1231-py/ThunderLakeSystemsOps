"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, ExternalLink, Link2, Key, Eye, EyeOff, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type QuickLink = {
  id: string;
  url: string;
  label: string;
  link_username: string | null;
  link_password: string | null;
  created_at: string;
};

type Form = { url: string; label: string; link_username: string; link_password: string };
const BLANK: Form = { url: "", label: "", link_username: "", link_password: "" };

function hostOf(raw: string) {
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch { return raw; }
}
function normalize(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

export function QuickLinks({ userId }: { userId: string }) {
  const [links, setLinks]         = useState<QuickLink[]>([]);
  const [adding, setAdding]       = useState(false);
  const [form, setForm]           = useState<Form>(BLANK);
  const [showAddPw, setShowAddPw] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Form>(BLANK);
  const [showEditPw, setShowEditPw] = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const db = supabase as any;

  // ── Load + realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    db.from("dashboard_links")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => { if (data) setLinks(data); });

    const ch = (supabase as any)
      .channel("dashboard-links")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "dashboard_links",
        filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if (p.eventType === "INSERT")      setLinks((s) => s.find((l) => l.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setLinks((s) => s.map((l) => l.id === p.new.id ? p.new : l));
        else if (p.eventType === "DELETE") setLinks((s) => s.filter((l) => l.id !== p.old.id));
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD ───────────────────────────────────────────────────────────────────
  async function add() {
    const raw = form.url.trim();
    if (!raw) return;
    const url   = normalize(raw);
    const label = form.label.trim() || hostOf(url);
    const id    = crypto.randomUUID();
    const now   = new Date().toISOString();
    const link: QuickLink = {
      id, url, label, created_at: now,
      link_username: form.link_username.trim() || null,
      link_password: form.link_password.trim() || null,
    };
    setLinks((s) => [link, ...s]);
    setForm(BLANK); setAdding(false); setShowAddPw(false);
    await db.from("dashboard_links").insert({ ...link, user_id: userId });
  }

  async function remove(id: string) {
    setLinks((s) => s.filter((l) => l.id !== id));
    await db.from("dashboard_links").delete().eq("id", id);
  }

  async function saveEdit(id: string) {
    const url   = normalize(editForm.url.trim() || links.find((l) => l.id === id)!.url);
    const label = editForm.label.trim() || hostOf(url);
    const patch = {
      url, label,
      link_username: editForm.link_username.trim() || null,
      link_password: editForm.link_password.trim() || null,
    };
    setLinks((s) => s.map((l) => l.id === id ? { ...l, ...patch } : l));
    setEditId(null); setEditForm(BLANK); setShowEditPw(false);
    await db.from("dashboard_links").update(patch).eq("id", id);
  }

  function startEdit(link: QuickLink) {
    setEditId(link.id);
    setEditForm({ url: link.url, label: link.label, link_username: link.link_username ?? "", link_password: link.link_password ?? "" });
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function startAdding() {
    setAdding(true);
    setTimeout(() => urlRef.current?.focus(), 0);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Quick Links</h2>
        <button onClick={startAdding} className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Add link">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-4 py-3 border-b border-zinc-800 space-y-2 shrink-0">
          <input ref={urlRef} value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setForm(BLANK); setShowAddPw(false); } }}
            placeholder="Paste URL…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Label (optional)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
          <input value={form.link_username} onChange={(e) => setForm((f) => ({ ...f, link_username: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Username (optional)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
          <div className="relative">
            <input value={form.link_password} onChange={(e) => setForm((f) => ({ ...f, link_password: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              type={showAddPw ? "text" : "password"} placeholder="Password (optional)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 pr-9 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
            <button onClick={() => setShowAddPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
              {showAddPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
            <button onClick={() => { setAdding(false); setForm(BLANK); setShowAddPw(false); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800">
        {links.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-10 px-4 gap-2 text-center">
            <Link2 className="h-5 w-5 text-zinc-700" />
            <p className="text-xs text-zinc-600">No links yet — add one above</p>
          </div>
        )}
        {links.map((link) =>
          editId === link.id ? (
            /* Edit form */
            <div key={link.id} className="px-4 py-3 space-y-2">
              <input value={editForm.url} onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="URL"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
              <input value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Label"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
              <input value={editForm.link_username} onChange={(e) => setEditForm((f) => ({ ...f, link_username: e.target.value }))}
                placeholder="Username"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
              <div className="relative">
                <input value={editForm.link_password} onChange={(e) => setEditForm((f) => ({ ...f, link_password: e.target.value }))}
                  type={showEditPw ? "text" : "password"} placeholder="Password"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 pr-9 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                <button onClick={() => setShowEditPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showEditPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveEdit(link.id)} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
                <button onClick={() => { setEditId(null); setEditForm(BLANK); setShowEditPw(false); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            /* Normal row */
            <div key={link.id} className="group flex items-center gap-2.5 px-4 py-3">
              <img src={`https://www.google.com/s2/favicons?sz=16&domain=${link.url}`} alt="" width={16} height={16}
                className="h-4 w-4 shrink-0 opacity-70"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div className="flex-1 min-w-0">
                <a href={link.url} target="_blank" rel="noopener noreferrer"
                  className="block text-sm text-zinc-300 hover:text-zinc-100 truncate transition-colors" title={link.url}>
                  {link.label}
                </a>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[10px] text-zinc-600 truncate">{hostOf(link.url)}</p>
                  {link.link_username && (
                    <p className="text-[10px] text-zinc-600 truncate">· {link.link_username}</p>
                  )}
                  {link.link_password && (
                    <p className="text-[10px] text-zinc-700">· ••••</p>
                  )}
                </div>
              </div>
              {/* Hover actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {link.link_username && (
                  <button onClick={() => copy(link.link_username!, `u-${link.id}`)} title="Copy username"
                    className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors text-[10px] font-bold">
                    {copied === `u-${link.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : "U"}
                  </button>
                )}
                {link.link_password && (
                  <button onClick={() => copy(link.link_password!, `p-${link.id}`)} title="Copy password"
                    className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                    {copied === `p-${link.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Key className="h-3 w-3" />}
                  </button>
                )}
                <a href={link.url} target="_blank" rel="noopener noreferrer" title="Open"
                  className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button onClick={() => startEdit(link)} title="Edit"
                  className="flex items-center justify-center h-6 w-6 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 2l2 2-6 6H2v-2l6-6z" />
                  </svg>
                </button>
                <button onClick={() => remove(link.id)} title="Remove"
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
