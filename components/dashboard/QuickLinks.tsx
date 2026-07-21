"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, Check, Copy, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Field = { key: string; value: string };
type LinkGroup = { id: string; name: string; fields: Field[]; created_at: string };

function looksLikeUrl(s: string) { return /^https?:\/\//i.test(s) || /^www\./i.test(s); }
function toHref(s: string) { return /^https?:\/\//i.test(s) ? s : `https://${s}`; }

export function QuickLinks({ userId }: { userId: string }) {
  const [groups, setGroups]         = useState<LinkGroup[]>([]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null);
  const [newFieldKey, setNewFieldKey]   = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [editingField, setEditingField]   = useState<{ groupId: string; idx: number } | null>(null);
  const [editKey, setEditKey]     = useState("");
  const [editValue, setEditValue] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName]   = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const groupNameRef = useRef<HTMLInputElement>(null);
  const fieldKeyRef  = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const db = supabase as any;

  // ── Load + realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    db.from("dashboard_links")
      .select("*").eq("user_id", userId).order("created_at", { ascending: true })
      .then(({ data }: any) => { if (data) setGroups(data); });

    const ch = db.channel("dashboard-links")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "dashboard_links",
        filter: `user_id=eq.${userId}`,
      }, (p: any) => {
        if      (p.eventType === "INSERT") setGroups((s) => s.find((g) => g.id === p.new.id) ? s : [...s, p.new]);
        else if (p.eventType === "UPDATE") setGroups((s) => s.map((g) => g.id === p.new.id ? p.new : g));
        else if (p.eventType === "DELETE") setGroups((s) => s.filter((g) => g.id !== p.old.id));
      }).subscribe();

    return () => { db.removeChannel(ch); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Group CRUD ───────────────────────────────────────────────────────────
  async function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const group: LinkGroup = { id, name, fields: [], created_at: new Date().toISOString() };
    setGroups((s) => [...s, group]);
    setAddingGroup(false); setNewGroupName("");
    await db.from("dashboard_links").insert({ ...group, user_id: userId });
  }

  async function deleteGroup(id: string) {
    setGroups((s) => s.filter((g) => g.id !== id));
    await db.from("dashboard_links").delete().eq("id", id);
  }

  async function renameGroup(id: string) {
    const name = editGroupName.trim();
    setEditingGroupId(null);
    if (!name) return;
    setGroups((s) => s.map((g) => g.id === id ? { ...g, name } : g));
    await db.from("dashboard_links").update({ name }).eq("id", id);
  }

  // ── Field CRUD ───────────────────────────────────────────────────────────
  async function addField(groupId: string) {
    const key = newFieldKey.trim();
    if (!key) return;
    const newField: Field = { key, value: newFieldValue.trim() };
    const group = groups.find((g) => g.id === groupId)!;
    const fields = [...group.fields, newField];
    setGroups((s) => s.map((g) => g.id === groupId ? { ...g, fields } : g));
    setAddingFieldTo(null); setNewFieldKey(""); setNewFieldValue("");
    await db.from("dashboard_links").update({ fields }).eq("id", groupId);
  }

  async function updateField(groupId: string, idx: number) {
    const key = editKey.trim();
    if (!key) return;
    const group = groups.find((g) => g.id === groupId)!;
    const fields = group.fields.map((f, i) => i === idx ? { key, value: editValue.trim() } : f);
    setGroups((s) => s.map((g) => g.id === groupId ? { ...g, fields } : g));
    setEditingField(null);
    await db.from("dashboard_links").update({ fields }).eq("id", groupId);
  }

  async function deleteField(groupId: string, idx: number) {
    const group = groups.find((g) => g.id === groupId)!;
    const fields = group.fields.filter((_, i) => i !== idx);
    setGroups((s) => s.map((g) => g.id === groupId ? { ...g, fields } : g));
    await db.from("dashboard_links").update({ fields }).eq("id", groupId);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function startAddField(groupId: string) {
    setAddingFieldTo(groupId);
    setEditingField(null);
    setTimeout(() => fieldKeyRef.current?.focus(), 0);
  }

  function startAddGroup() {
    setAddingGroup(true);
    setTimeout(() => groupNameRef.current?.focus(), 0);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-sm font-medium text-zinc-100">Quick Links</h2>
        <button onClick={startAddGroup} className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Add group">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* New group form */}
      {addingGroup && (
        <div className="px-4 py-3 border-b border-zinc-800 space-y-2 shrink-0">
          <input ref={groupNameRef} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addGroup(); if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); } }}
            placeholder="Entry name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
          <div className="flex gap-2">
            <button onClick={addGroup} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
            <button onClick={() => { setAddingGroup(false); setNewGroupName(""); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800">
        {groups.length === 0 && !addingGroup && (
          <div className="flex flex-col items-center justify-center py-10 px-4 gap-3">
            <p className="text-xs text-zinc-600">No entries yet</p>
            <button onClick={startAddGroup} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
              <Plus className="h-3 w-3" /> Add entry
            </button>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.id} className="py-3">
            {/* Group header */}
            <div className="group/hdr flex items-center gap-2 px-4 mb-1.5">
              {editingGroupId === group.id ? (
                <input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renameGroup(group.id); if (e.key === "Escape") setEditingGroupId(null); }}
                  onBlur={() => renameGroup(group.id)}
                  autoFocus
                  className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-200 outline-none" />
              ) : (
                <span
                  className="flex-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-default"
                  onDoubleClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); }}
                >
                  {group.name}
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
                <button onClick={() => startAddField(group.id)} title="Add field"
                  className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
                <button onClick={() => deleteGroup(group.id)} title="Delete entry"
                  className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-0.5">
              {group.fields.map((field, idx) => {
                const isEditing = editingField?.groupId === group.id && editingField.idx === idx;
                const copyKey = `${group.id}-${idx}`;
                return isEditing ? (
                  <div key={idx} className="mx-4 space-y-1.5 py-1">
                    <input value={editKey} onChange={(e) => setEditKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingField(null); }}
                      placeholder="Field name"
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500" />
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") updateField(group.id, idx); if (e.key === "Escape") setEditingField(null); }}
                      placeholder="Value"
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500" />
                    <div className="flex gap-1.5">
                      <button onClick={() => updateField(group.id, idx)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
                      <button onClick={() => setEditingField(null)} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="group/field flex items-center gap-2 px-4 py-1">
                    <span className="w-24 shrink-0 text-xs text-zinc-600 truncate">{field.key}</span>
                    <div className="flex-1 min-w-0">
                      {looksLikeUrl(field.value) ? (
                        <a href={toHref(field.value)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-zinc-300 hover:text-zinc-100 truncate block transition-colors">
                          {field.value}
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-300 truncate block">{field.value || <span className="text-zinc-700 italic">—</span>}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0">
                      {field.value && (
                        <button onClick={() => copy(field.value, copyKey)} title="Copy"
                          className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                          {copied === copyKey ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                      {looksLikeUrl(field.value) && (
                        <a href={toHref(field.value)} target="_blank" rel="noopener noreferrer" title="Open"
                          className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button onClick={() => { setEditingField({ groupId: group.id, idx }); setEditKey(field.key); setEditValue(field.value); setAddingFieldTo(null); }}
                        title="Edit"
                        className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M8 2l2 2-6 6H2v-2l6-6z" />
                        </svg>
                      </button>
                      <button onClick={() => deleteField(group.id, idx)} title="Delete"
                        className="flex items-center justify-center h-5 w-5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add field form */}
              {addingFieldTo === group.id && (
                <div className="mx-4 space-y-1.5 pt-1">
                  <input ref={fieldKeyRef} value={newFieldKey} onChange={(e) => setNewFieldKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setAddingFieldTo(null); setNewFieldKey(""); setNewFieldValue(""); } }}
                    placeholder="Field name"
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                  <input value={newFieldValue} onChange={(e) => setNewFieldValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addField(group.id); if (e.key === "Escape") { setAddingFieldTo(null); setNewFieldKey(""); setNewFieldValue(""); } }}
                    placeholder="Value"
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600" />
                  <div className="flex gap-1.5">
                    <button onClick={() => addField(group.id)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Save</button>
                    <button onClick={() => { setAddingFieldTo(null); setNewFieldKey(""); setNewFieldValue(""); }}
                      className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                  </div>
                </div>
              )}

              {/* Empty group nudge */}
              {group.fields.length === 0 && addingFieldTo !== group.id && (
                <button onClick={() => startAddField(group.id)}
                  className="mx-4 flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-500 transition-colors py-0.5">
                  <Plus className="h-3 w-3" /> add field
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
