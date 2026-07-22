"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, X, Palette, ThumbsUp, ThumbsDown, MessageSquare, Send, Eye, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StrategyCard = {
  id: string;
  category: string;
  content: string;
  notes: string;
  status: string;
  author_email: string;
  created_at: string;
  updated_at: string;
  domain_available?: boolean | null;
  domain_checked_at?: string | null;
};

export type StrategyTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  author_email: string;
  created_at: string;
  updated_at: string;
};

export type StrategyNote = {
  id: string;
  title: string;
  content: string;
  updated_by_email: string;
  created_at: string;
  updated_at: string;
};

export type StrategyImage = {
  id: string;
  storage_path: string;
  caption: string;
  author_email: string;
  created_at: string;
};

export type StrategyPrefs = {
  user_id: string;
  theme: "dark" | "light";
  bg_color: string | null;
  text_color: string | null;
  header_color: string | null;
};

export type StrategyColumn = {
  id: string;
  name: string;
  position: number;
  created_at: string;
};

export type StrategyReaction = {
  id: string;
  item_id: string;
  item_type: string;
  reaction: "up" | "down";
  author_email: string;
  created_at: string;
};

export type StrategyMessage = {
  id: string;
  content: string;
  author_email: string;
  created_at: string;
};

export type StrategyComment = {
  id: string;
  item_id: string;
  item_type: string;
  content: string;
  author_email: string;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(email: string) {
  return email ? email.split("@")[0] : "";
}

const DOMAIN_COOLDOWN_MS = 15 * 60 * 1000; // 15 min between checks per card

function parseDomainForCheck(content: string): string {
  let s = content.trim().toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];
  return s.includes(".") ? s : `${s}.com`;
}

function canCheckDomain(checkedAt?: string | null): boolean {
  if (!checkedAt) return true;
  return Date.now() - new Date(checkedAt).getTime() >= DOMAIN_COOLDOWN_MS;
}

function domainCooldownLeft(checkedAt?: string | null): number {
  if (!checkedAt) return 0;
  return Math.max(0, DOMAIN_COOLDOWN_MS - (Date.now() - new Date(checkedAt).getTime()));
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function timeAgoPrecise(iso: string): string {
  const total = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ") + " ago";
}

function formatCooldown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Theme CSS ─────────────────────────────────────────────────────────────────

function buildThemeCSS(prefs: StrategyPrefs): string {
  const light  = prefs.theme === "light";
  const bg     = prefs.bg_color;
  const text   = prefs.text_color;
  const header = prefs.header_color;
  let css = "";

  if (light) {
    css += `
      .bg-zinc-950{background-color:#f1f5f9!important}
      .sh-root{background-color:#f1f5f9!important}
      .sh-root .bg-zinc-900{background-color:#ffffff!important}
      .sh-root .bg-zinc-800{background-color:#f1f5f9!important}
      .sh-root .bg-zinc-700{background-color:#e2e8f0!important}
      .sh-root .bg-zinc-100{background-color:#1e293b!important}
      .sh-root .hover\\:bg-zinc-800:hover{background-color:#e2e8f0!important}
      .sh-root .hover\\:bg-zinc-800\\/60:hover{background-color:rgba(226,232,240,.6)!important}
      .sh-root .hover\\:bg-zinc-700:hover{background-color:#cbd5e1!important}
      .sh-root .hover\\:bg-zinc-600:hover{background-color:#94a3b8!important}
      .sh-root .bg-zinc-800\\/50{background-color:rgba(241,245,249,.5)!important}
      .sh-root .bg-zinc-800\\/60{background-color:rgba(241,245,249,.6)!important}
      .sh-root .text-zinc-100{color:#0f172a!important}
      .sh-root .text-zinc-200{color:#0f172a!important}
      .sh-root .text-zinc-300{color:#334155!important}
      .sh-root .text-zinc-400{color:#475569!important}
      .sh-root .text-zinc-500{color:#64748b!important}
      .sh-root .text-zinc-600{color:#94a3b8!important}
      .sh-root .text-zinc-700{color:#cbd5e1!important}
      .sh-root .text-zinc-900{color:#f8fafc!important}
      .sh-root .border-zinc-800{border-color:#e2e8f0!important}
      .sh-root .border-zinc-700{border-color:#cbd5e1!important}
      .sh-root .divide-zinc-800>*+*{border-color:#e2e8f0!important}
      .sh-root .placeholder\\:text-zinc-600::placeholder{color:#94a3b8!important}
      .sh-root textarea,.sh-root select,.sh-root input[type=text],.sh-root input[type=email]{color:#0f172a!important}
      .sh-root select{background-color:#f1f5f9!important}
      .sh-root h1,.sh-root h2,.sh-root h3,.sh-root .sh-header{color:#0f172a!important}
    `;
  }

  if (bg) {
    css += `.bg-zinc-950{background-color:${bg}!important}.sh-root{background-color:${bg}!important}`;
  }

  if (text) {
    css += `
      .sh-root .text-zinc-100{color:${text}!important}
      .sh-root .text-zinc-200{color:${text}!important}
      .sh-root .text-zinc-300{color:${text}cc!important}
      .sh-root textarea,.sh-root input[type=text],.sh-root input[type=email]{color:${text}!important}
    `;
  }

  if (header) {
    css += `.sh-root h1,.sh-root h2,.sh-root h3,.sh-root .sh-header{color:${header}!important}`;
  }

  return css;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_STATUSES = [
  { key: "idea",        label: "Idea",        cls: "bg-zinc-700 text-zinc-300"           },
  { key: "shortlisted", label: "Shortlisted", cls: "bg-blue-900/60 text-blue-300"       },
  { key: "approved",    label: "Approved",    cls: "bg-emerald-900/60 text-emerald-300" },
  { key: "archived",    label: "Archived",    cls: "bg-zinc-800 text-zinc-600"           },
];

const TASK_STATUSES = [
  { key: "todo",        label: "To Do"       },
  { key: "in_progress", label: "In Progress" },
  { key: "done",        label: "Done"        },
];

const PRIORITY_DOT: Record<string, string> = {
  low:    "bg-zinc-500",
  medium: "bg-amber-500",
  high:   "bg-red-500",
};

const DEFAULT_PREFS: StrategyPrefs = { user_id: "", theme: "dark", bg_color: null, text_color: null, header_color: null };

// ── Main Component ────────────────────────────────────────────────────────────

export function StrategyHub({
  initialCards, initialTasks, initialNotes, initialImages,
  initialColumns, initialReactions, initialComments,
  initialPrefs, allPrefs, teamMembers,
  userEmail, userId, isAdmin, initialMessages,
}: {
  initialCards: StrategyCard[];
  initialTasks: StrategyTask[];
  initialNotes: StrategyNote[];
  initialImages: StrategyImage[];
  initialColumns: StrategyColumn[];
  initialReactions: StrategyReaction[];
  initialComments: StrategyComment[];
  initialPrefs: StrategyPrefs | null;
  allPrefs: StrategyPrefs[];
  teamMembers: { id: string; email: string }[];
  userEmail: string;
  userId: string;
  isAdmin: boolean;
  initialMessages: StrategyMessage[];
}) {
  const [tab, setTab] = useState<"ideas" | "tasks" | "notes" | "moodboard">("ideas");
  const [cards, setCards]       = useState<StrategyCard[]>(initialCards);
  const [tasks, setTasks]       = useState<StrategyTask[]>(initialTasks);
  const [notes, setNotes]       = useState<StrategyNote[]>(initialNotes);
  const [images, setImages]     = useState<StrategyImage[]>(initialImages);
  const [columns, setColumns]   = useState<StrategyColumn[]>(initialColumns);
  const [reactions, setReactions] = useState<StrategyReaction[]>(initialReactions);
  const [comments, setComments] = useState<StrategyComment[]>(initialComments);
  const [messages, setMessages] = useState<StrategyMessage[]>(initialMessages);
  const [prefs, setPrefs]       = useState<StrategyPrefs>(initialPrefs ?? { ...DEFAULT_PREFS, user_id: userId });
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);

  const supabase = createClient();
  const db = supabase as unknown as SupabaseClient;

  const activePrefs = useMemo(() => {
    if (!viewAsUserId) return prefs;
    return allPrefs.find((p) => p.user_id === viewAsUserId) ?? DEFAULT_PREFS;
  }, [viewAsUserId, prefs, allPrefs]);

  const themeCSS = useMemo(() => buildThemeCSS(activePrefs), [activePrefs]);

  const savePrefs = useCallback(async (next: StrategyPrefs) => {
    setPrefs(next);
    await db.from("strategy_preferences").upsert({ ...next, user_id: userId });
  }, [db, userId]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = (supabase as any)
      .channel("strategy-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_cards" }, (p: any) => {
        if (p.eventType === "INSERT")      setCards((s) => s.find((c) => c.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setCards((s) => s.map((c) => c.id === p.new.id ? p.new : c));
        else if (p.eventType === "DELETE") setCards((s) => s.filter((c) => c.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_tasks" }, (p: any) => {
        if (p.eventType === "INSERT")      setTasks((s) => s.find((t) => t.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setTasks((s) => s.map((t) => t.id === p.new.id ? p.new : t));
        else if (p.eventType === "DELETE") setTasks((s) => s.filter((t) => t.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_notes" }, (p: any) => {
        if (p.eventType === "INSERT")      setNotes((s) => s.find((n) => n.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setNotes((s) => s.map((n) => n.id === p.new.id ? p.new : n));
        else if (p.eventType === "DELETE") setNotes((s) => s.filter((n) => n.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_images" }, (p: any) => {
        if (p.eventType === "INSERT")      setImages((s) => s.find((i) => i.id === p.new.id) ? s : [p.new, ...s]);
        else if (p.eventType === "UPDATE") setImages((s) => s.map((i) => i.id === p.new.id ? p.new : i));
        else if (p.eventType === "DELETE") setImages((s) => s.filter((i) => i.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_columns" }, (p: any) => {
        if (p.eventType === "INSERT")      setColumns((s) => s.find((c) => c.id === p.new.id) ? s : [...s, p.new].sort((a, b) => a.position - b.position));
        else if (p.eventType === "UPDATE") setColumns((s) => s.map((c) => c.id === p.new.id ? p.new : c));
        else if (p.eventType === "DELETE") setColumns((s) => s.filter((c) => c.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_reactions" }, (p: any) => {
        if (p.eventType === "INSERT")      setReactions((s) => s.find((r) => r.id === p.new.id) ? s : [...s, p.new]);
        else if (p.eventType === "UPDATE") setReactions((s) => s.map((r) => r.id === p.new.id ? p.new : r));
        else if (p.eventType === "DELETE") setReactions((s) => s.filter((r) => r.id !== p.old.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_comments" }, (p: any) => {
        if (p.eventType === "INSERT")      setComments((s) => s.find((c) => c.id === p.new.id) ? s : [...s, p.new]);
        else if (p.eventType === "UPDATE") setComments((s) => s.map((c) => c.id === p.new.id ? p.new : c));
        else if (p.eventType === "DELETE") setComments((s) => s.filter((c) => c.id !== p.old.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "strategy_chat" }, (p: any) => {
        setMessages((s) => s.find((m) => m.id === p.new.id) ? s : [...s, p.new]);
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Card CRUD ─────────────────────────────────────────────────────────────
  async function addCard(category: string, content: string) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setCards((s) => [{ id, category, content, notes: "", status: "idea", author_email: userEmail, created_at: now, updated_at: now }, ...s]);
    await db.from("strategy_cards").insert({ id, category, content, notes: "", status: "idea", author_email: userEmail });
  }
  async function updateCard(id: string, updates: Partial<StrategyCard>) {
    setCards((s) => s.map((c) => c.id === id ? { ...c, ...updates } : c));
    await db.from("strategy_cards").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteCard(id: string) {
    setCards((s) => s.filter((c) => c.id !== id));
    setReactions((s) => s.filter((r) => r.item_id !== id));
    setComments((s) => s.filter((c) => c.item_id !== id));
    await db.from("strategy_reactions").delete().eq("item_id", id);
    await db.from("strategy_comments").delete().eq("item_id", id);
    await db.from("strategy_cards").delete().eq("id", id);
  }

  // ── Column CRUD ───────────────────────────────────────────────────────────
  async function addColumn(name: string) {
    const id = crypto.randomUUID();
    const position = columns.length;
    const now = new Date().toISOString();
    setColumns((s) => [...s, { id, name, position, created_at: now }]);
    await db.from("strategy_columns").insert({ id, name, position });
  }
  async function updateColumn(id: string, updates: Partial<StrategyColumn>) {
    setColumns((s) => s.map((c) => c.id === id ? { ...c, ...updates } : c));
    await db.from("strategy_columns").update(updates).eq("id", id);
  }
  async function deleteColumn(id: string) {
    const count = cards.filter((c) => c.category === id).length;
    if (count > 0 && !confirm(`Delete column and its ${count} card(s)?`)) return;
    setColumns((s) => s.filter((c) => c.id !== id));
    setCards((s) => s.filter((c) => c.category !== id));
    await db.from("strategy_cards").delete().eq("category", id);
    await db.from("strategy_columns").delete().eq("id", id);
  }

  // ── Reaction / Comment CRUD ───────────────────────────────────────────────
  async function toggleReaction(itemId: string, itemType: string, reaction: "up" | "down") {
    const existing = reactions.find((r) => r.item_id === itemId && r.item_type === itemType && r.author_email === userEmail);
    if (existing) {
      if (existing.reaction === reaction) {
        setReactions((s) => s.filter((r) => r.id !== existing.id));
        await db.from("strategy_reactions").delete().eq("id", existing.id);
      } else {
        setReactions((s) => s.map((r) => r.id === existing.id ? { ...r, reaction } : r));
        await db.from("strategy_reactions").update({ reaction }).eq("id", existing.id);
      }
    } else {
      const id = crypto.randomUUID();
      const newR: StrategyReaction = { id, item_id: itemId, item_type: itemType, reaction, author_email: userEmail, created_at: new Date().toISOString() };
      setReactions((s) => [...s, newR]);
      await db.from("strategy_reactions").insert(newR);
    }
  }

  async function addComment(itemId: string, itemType: string, content: string) {
    const id = crypto.randomUUID();
    const newC: StrategyComment = { id, item_id: itemId, item_type: itemType, content, author_email: userEmail, created_at: new Date().toISOString() };
    setComments((s) => [...s, newC]);
    await db.from("strategy_comments").insert(newC);
  }

  async function deleteComment(id: string) {
    setComments((s) => s.filter((c) => c.id !== id));
    await db.from("strategy_comments").delete().eq("id", id);
  }

  // ── Domain availability check ─────────────────────────────────────────────
  async function checkDomain(card: StrategyCard) {
    if (!canCheckDomain(card.domain_checked_at)) return;
    const domain = parseDomainForCheck(card.content);
    try {
      const res = await fetch(`/api/domain-check?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      await updateCard(card.id, {
        domain_available: typeof data.available === "boolean" ? data.available : null,
        domain_checked_at: new Date().toISOString(),
      });
    } catch {
      // don't update checked_at on failure so they can retry immediately
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendMessage(content: string) {
    const id = crypto.randomUUID();
    const msg: StrategyMessage = { id, content, author_email: userEmail, created_at: new Date().toISOString() };
    setMessages((s) => {
      const next = [...s, msg];
      return next.length > 300 ? next.slice(-300) : next;
    });
    await db.from("strategy_chat").insert(msg);
    // Prune server-side ~10% of sends to stay under 500 messages
    if (Math.random() < 0.1) {
      const { count } = await db.from("strategy_chat").select("id", { count: "exact", head: true });
      if ((count ?? 0) > 500) {
        const { data: old } = await db
          .from("strategy_chat")
          .select("id")
          .order("created_at", { ascending: true })
          .limit((count ?? 0) - 400);
        if (old?.length) {
          await db.from("strategy_chat").delete().in("id", old.map((m: any) => m.id));
        }
      }
    }
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  async function addTask(status: string, title: string) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setTasks((s) => [{ id, title, status, description: "", priority: "medium", assignee: "", author_email: userEmail, created_at: now, updated_at: now }, ...s]);
    await db.from("strategy_tasks").insert({ id, title, status, description: "", priority: "medium", assignee: "", author_email: userEmail });
  }
  async function updateTask(id: string, updates: Partial<StrategyTask>) {
    setTasks((s) => s.map((t) => t.id === id ? { ...t, ...updates } : t));
    await db.from("strategy_tasks").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteTask(id: string) {
    setTasks((s) => s.filter((t) => t.id !== id));
    await db.from("strategy_tasks").delete().eq("id", id);
  }

  // ── Note CRUD ─────────────────────────────────────────────────────────────
  async function addNote() {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setNotes((s) => [{ id, title: "Untitled", content: "", updated_by_email: userEmail, created_at: now, updated_at: now }, ...s]);
    await db.from("strategy_notes").insert({ id, title: "Untitled", content: "", updated_by_email: userEmail });
  }
  async function updateNote(id: string, updates: Partial<StrategyNote>) {
    setNotes((s) => s.map((n) => n.id === id ? { ...n, ...updates } : n));
    await db.from("strategy_notes").update({ ...updates, updated_at: new Date().toISOString(), updated_by_email: userEmail }).eq("id", id);
  }
  async function deleteNote(id: string) {
    setNotes((s) => s.filter((n) => n.id !== id));
    await db.from("strategy_notes").delete().eq("id", id);
  }

  // ── Image CRUD ────────────────────────────────────────────────────────────
  async function uploadImage(file: File) {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await (supabase as any).storage
      .from("strategy-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) { console.error("Upload failed", error); return; }
    await db.from("strategy_images").insert({ storage_path: path, caption: "", author_email: userEmail });
  }

  async function updateImageCaption(id: string, caption: string) {
    await db.from("strategy_images").update({ caption }).eq("id", id);
  }

  async function deleteImage(id: string, storagePath: string) {
    await (supabase as any).storage.from("strategy-images").remove([storagePath]);
    await db.from("strategy_images").delete().eq("id", id);
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data } = await (supabase as any).storage
      .from("strategy-images")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? "";
  }

  const viewAsEmail = viewAsUserId
    ? teamMembers.find((m) => m.id === viewAsUserId)?.email ?? ""
    : "";

  return (
    <div className="sh-root flex gap-4" style={{ minHeight: "calc(100vh - 10rem)" }}>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />

      {/* User switcher sidebar — admin only */}
      {isAdmin && (
        <UserSwitcherSidebar
          userId={userId}
          userEmail={userEmail}
          teamMembers={teamMembers}
          viewAsUserId={viewAsUserId}
          onSwitch={setViewAsUserId}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Preview banner */}
        {viewAsUserId && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 text-xs text-amber-300">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Viewing as {displayName(viewAsEmail)}
            <button onClick={() => setViewAsUserId(null)} className="ml-auto text-amber-500 hover:text-amber-300 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Strategy Hub</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Shared workspace ·{" "}
              <a
                href="https://tlv1231-py.github.io/ThunderLakeSystems/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-2"
              >
                Website
              </a>
            </p>
          </div>
          {!viewAsUserId && (
            <div className="relative">
              <button
                onClick={() => setThemeOpen((o) => !o)}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Customize theme"
              >
                <Palette className="h-4 w-4" />
              </button>
              {themeOpen && (
                <ThemePanel prefs={prefs} onChange={savePrefs} onClose={() => setThemeOpen(false)} />
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-zinc-800">
          {(["ideas", "tasks", "notes", "moodboard"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-5 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors",
                tab === t
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t === "ideas" ? "Ideas Board" : t === "tasks" ? "Tasks" : t === "notes" ? "Notes" : "Moodboard"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {tab === "ideas" && (
            <IdeasBoard
              cards={cards.filter((c) => c.status !== "archived")}
              columns={columns}
              reactions={reactions}
              comments={comments}
              userEmail={userEmail}
              onAdd={addCard}
              onUpdate={updateCard}
              onDelete={deleteCard}
              onAddColumn={addColumn}
              onUpdateColumn={updateColumn}
              onDeleteColumn={deleteColumn}
              onToggleReaction={toggleReaction}
              onAddComment={addComment}
              onDeleteComment={deleteComment}
              onCheckDomain={checkDomain}
            />
          )}
          {tab === "tasks" && (
            <TaskBoard tasks={tasks} onAdd={addTask} onUpdate={updateTask} onDelete={deleteTask} />
          )}
          {tab === "notes" && (
            <NotesPanel notes={notes} onAdd={addNote} onUpdate={updateNote} onDelete={deleteNote} />
          )}
          {tab === "moodboard" && (
            <MoodboardPanel
              images={images}
              onUpload={uploadImage}
              onDelete={deleteImage}
              onUpdateCaption={updateImageCaption}
              getSignedUrl={getSignedUrl}
            />
          )}
        </div>
      </div>

      {/* Chat panel */}
      <ChatPanel messages={messages} userEmail={userEmail} onSend={sendMessage} />
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ messages, userEmail, onSend }: {
  messages: StrategyMessage[];
  userEmail: string;
  onSend: (content: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await onSend(t);
  }

  return (
    <div
      className="shrink-0 w-64 flex flex-col border-l border-zinc-800 sticky"
      style={{ top: 0, height: "calc(100vh - 6rem)", alignSelf: "flex-start" }}
    >
      <div className="px-4 py-3 border-b border-zinc-800 shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Team Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <p className="px-4 text-xs text-zinc-700">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const isMe   = m.author_email === userEmail;
          const name   = displayName(m.author_email);
          const time   = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={m.id} className="px-3 flex gap-2 items-start">
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5",
                isMe ? "bg-zinc-600 text-zinc-100" : "bg-zinc-800 text-zinc-300"
              )}>
                {name.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className="text-[11px] font-medium text-zinc-300 truncate">{name}</span>
                  <span className="text-[9px] text-zinc-600 shrink-0">{time}</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed break-words">{m.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-3 pt-2 border-t border-zinc-800 shrink-0">
        <div className="flex gap-1.5 items-center">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message the team..."
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="p-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-30 transition-colors shrink-0"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User Switcher Sidebar ─────────────────────────────────────────────────────

function UserSwitcherSidebar({
  userId, userEmail, teamMembers, viewAsUserId, onSwitch,
}: {
  userId: string;
  userEmail: string;
  teamMembers: { id: string; email: string }[];
  viewAsUserId: string | null;
  onSwitch: (id: string | null) => void;
}) {
  const allUsers = [
    { id: userId, email: userEmail, isYou: true },
    ...teamMembers.map((m) => ({ ...m, isYou: false })),
  ];
  const activeId = viewAsUserId ?? userId;

  return (
    <div className="flex flex-col items-center gap-2 pt-1 shrink-0">
      {allUsers.map(({ id, email, isYou }) => {
        const letter = displayName(email).charAt(0).toUpperCase();
        const isActive = id === activeId;
        return (
          <button
            key={id}
            onClick={() => onSwitch(isYou ? null : id)}
            title={isYou ? "You" : displayName(email)}
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
              isActive
                ? "bg-zinc-100 text-zinc-900 ring-2 ring-zinc-400 ring-offset-2 ring-offset-zinc-950"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            )}
          >
            {letter}
          </button>
        );
      })}
      <div className="h-px w-5 bg-zinc-800 mt-1" />
    </div>
  );
}

// ── Domain Availability Panel ─────────────────────────────────────────────────

function DomainAvailabilityPanel({ card, onCheck }: {
  card: StrategyCard;
  onCheck: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const left    = domainCooldownLeft(card.domain_checked_at);
  const hasData = card.domain_available !== null && card.domain_available !== undefined;
  const canCheck = !checking && left === 0;

  async function handle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canCheck) return;
    setChecking(true);
    await onCheck();
    setChecking(false);
  }

  return (
    <div className="w-36 shrink-0 border-l border-zinc-800 flex flex-col justify-center gap-1 px-3 py-2">
      {checking ? (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-zinc-500 shrink-0" />
          <span className="text-[10px] text-zinc-500">Checking…</span>
        </div>
      ) : !hasData ? (
        <button
          onClick={handle}
          disabled={!canCheck}
          className={cn(
            "text-xs text-left leading-snug transition-colors",
            canCheck ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-700 cursor-default"
          )}
        >
          {left > 0 ? `Check in ${formatCooldown(left)}` : "Check Availability"}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-1">
            {card.domain_available ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-medium text-emerald-400">Available</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-xs font-medium text-red-400">Unavailable</span>
              </>
            )}
          </div>
          {card.domain_checked_at && (
            <p className="text-[10px] text-zinc-600 leading-snug">
              Last checked {timeAgoPrecise(card.domain_checked_at)}
            </p>
          )}
          {left > 0 ? (
            <span className="text-[10px] text-zinc-700">recheck in {formatCooldown(left)}</span>
          ) : (
            <button
              onClick={handle}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors text-left"
            >
              Check again
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Ideas Board ───────────────────────────────────────────────────────────────

function IdeasBoard({
  cards, columns, reactions, comments, userEmail,
  onAdd, onUpdate, onDelete,
  onAddColumn, onUpdateColumn, onDeleteColumn,
  onToggleReaction, onAddComment, onDeleteComment, onCheckDomain,
}: {
  cards: StrategyCard[];
  columns: StrategyColumn[];
  reactions: StrategyReaction[];
  comments: StrategyComment[];
  userEmail: string;
  onAdd: (category: string, content: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StrategyCard>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddColumn: (name: string) => Promise<void>;
  onUpdateColumn: (id: string, updates: Partial<StrategyColumn>) => Promise<void>;
  onDeleteColumn: (id: string) => Promise<void>;
  onToggleReaction: (itemId: string, itemType: string, reaction: "up" | "down") => Promise<void>;
  onAddComment: (itemId: string, itemType: string, content: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  onCheckDomain: (card: StrategyCard) => Promise<void>;
}) {
  const [selected, setSelected] = useState<StrategyCard | null>(null);
  const [adding, setAdding]     = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");
  const [addingCol, setAddingCol]   = useState(false);
  const [newColName, setNewColName] = useState("");

  async function handleAddCard(colId: string) {
    if (!newContent.trim()) return;
    await onAdd(colId, newContent.trim());
    setNewContent("");
    setAdding(null);
  }

  async function handleAddColumn() {
    if (!newColName.trim()) return;
    await onAddColumn(newColName.trim());
    setNewColName("");
    setAddingCol(false);
  }

  const domainsColId = columns.find((c) => c.name.toLowerCase() === "domains")?.id;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.category === col.id);
        const isDomainCol = col.id === domainsColId;
        return (
          <div key={col.id} className={cn("flex-1 flex flex-col", isDomainCol ? "min-w-[22rem]" : "min-w-52")}>
            <ColumnHeader
              column={col}
              cardCount={colCards.length}
              onRename={(name) => onUpdateColumn(col.id, { name })}
              onDelete={() => onDeleteColumn(col.id)}
            />
            <div className="flex flex-col gap-2">
              {colCards.map((card) => (
                <div key={card.id} className={cn("flex gap-0", isDomainCol && "items-stretch")}>
                  <div className="flex-1 min-w-0">
                    <IdeaCard
                      card={card}
                      reactions={reactions}
                      comments={comments}
                      userEmail={userEmail}
                      onClick={() => setSelected(card)}
                      onDelete={() => onDelete(card.id)}
                      onToggleReaction={(r) => onToggleReaction(card.id, "card", r)}
                      onAddComment={(c) => onAddComment(card.id, "card", c)}
                      onDeleteComment={onDeleteComment}
                    />
                  </div>
                  {isDomainCol && (
                    <DomainAvailabilityPanel
                      card={card}
                      onCheck={() => onCheckDomain(card)}
                    />
                  )}
                </div>
              ))}
            </div>
            {adding === col.id ? (
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2.5">
                <textarea
                  autoFocus
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddCard(col.id); }
                    if (e.key === "Escape") { setAdding(null); setNewContent(""); }
                  }}
                  placeholder="Type and press Enter..."
                  rows={2}
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleAddCard(col.id)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Add</button>
                  <button onClick={() => { setAdding(null); setNewContent(""); }} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(col.id); setNewContent(""); }}
                className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add idea
              </button>
            )}
          </div>
        );
      })}

      {/* Add column */}
      <div className="shrink-0 w-44">
        {addingCol ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-3">
            <input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColumn();
                if (e.key === "Escape") { setAddingCol(false); setNewColName(""); }
              }}
              placeholder="Column name..."
              className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 mb-2"
            />
            <div className="flex gap-2">
              <button onClick={handleAddColumn} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Add</button>
              <button onClick={() => { setAddingCol(false); setNewColName(""); }} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCol(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-500 transition-colors w-full mt-6"
          >
            <Plus className="h-3.5 w-3.5" /> Add column
          </button>
        )}
      </div>

      {selected && (
        <IdeaEditPanel
          card={selected}
          onUpdate={(updates) => { onUpdate(selected.id, updates); setSelected({ ...selected, ...updates }); }}
          onDelete={() => { onDelete(selected.id); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Column Header ─────────────────────────────────────────────────────────────

function ColumnHeader({
  column, cardCount, onRename, onDelete,
}: {
  column: StrategyColumn;
  cardCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setName(column.name); }, [column.name]);

  function save() {
    const t = name.trim();
    if (t && t !== column.name) onRename(t); else setName(column.name);
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between mb-3 group">
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(column.name); setEditing(false); } }}
          className="sh-header flex-1 text-xs font-semibold uppercase tracking-wide bg-transparent border-b border-zinc-600 outline-none text-zinc-300 mr-2 py-0.5"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click to rename"
          className="sh-header text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors text-left flex-1"
        >
          {column.name}
        </button>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-700 font-mono">{cardCount}</span>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-red-400 transition-all p-0.5"
          title="Delete column"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Idea Card ─────────────────────────────────────────────────────────────────

function IdeaCard({
  card, reactions, comments, userEmail,
  onClick, onDelete, onToggleReaction, onAddComment, onDeleteComment,
}: {
  card: StrategyCard;
  reactions: StrategyReaction[];
  comments: StrategyComment[];
  userEmail: string;
  onClick: () => void;
  onDelete: () => void;
  onToggleReaction: (reaction: "up" | "down") => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const statusInfo    = CARD_STATUSES.find((s) => s.key === card.status) ?? CARD_STATUSES[0];
  const cardReactions = reactions.filter((r) => r.item_id === card.id && r.item_type === "card");
  const cardComments  = comments.filter((c) => c.item_id === card.id && c.item_type === "card");
  const myReaction    = cardReactions.find((r) => r.author_email === userEmail);
  const ups           = cardReactions.filter((r) => r.reaction === "up").length;
  const downs         = cardReactions.filter((r) => r.reaction === "down").length;

  useEffect(() => { if (commentsOpen) inputRef.current?.focus(); }, [commentsOpen]);

  async function submitComment() {
    const t = newComment.trim();
    if (!t) return;
    setNewComment("");
    await onAddComment(t);
  }

  return (
    <div className="group relative rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700">
      <div className="p-3 cursor-pointer" onClick={onClick}>
        <p className="text-sm text-zinc-200 leading-snug pr-4">{card.content}</p>
        {card.notes && (
          <p className="mt-1 text-xs text-zinc-500 leading-snug line-clamp-2">{card.notes}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          {card.status !== "idea" && (
            <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusInfo.cls)}>
              {statusInfo.label}
            </span>
          )}
          {displayName(card.author_email) && (
            <span className="text-[10px] text-zinc-700 ml-auto">{displayName(card.author_email)}</span>
          )}
        </div>
      </div>

      {/* Reactions bar */}
      <div className="px-3 pb-2 border-t border-zinc-800 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleReaction("up"); }}
          className={cn("flex items-center gap-1 text-xs mt-2 transition-colors", myReaction?.reaction === "up" ? "text-emerald-400" : "text-zinc-600 hover:text-zinc-400")}
          title="Thumbs up"
        >
          <ThumbsUp className="h-3 w-3" />{ups > 0 && <span>{ups}</span>}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleReaction("down"); }}
          className={cn("flex items-center gap-1 text-xs mt-2 transition-colors", myReaction?.reaction === "down" ? "text-red-400" : "text-zinc-600 hover:text-zinc-400")}
          title="Thumbs down"
        >
          <ThumbsDown className="h-3 w-3" />{downs > 0 && <span>{downs}</span>}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setCommentsOpen((o) => !o); }}
          className={cn("flex items-center gap-1 text-xs mt-2 ml-auto transition-colors", commentsOpen || cardComments.length > 0 ? "text-zinc-400" : "text-zinc-600 hover:text-zinc-400")}
          title="Comments"
        >
          <MessageSquare className="h-3 w-3" />{cardComments.length > 0 && <span>{cardComments.length}</span>}
        </button>
      </div>

      {/* Comments panel */}
      {commentsOpen && (
        <div className="border-t border-zinc-800 px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          {cardComments.length > 0 && (
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
              {cardComments.map((c) => (
                <div key={c.id} className="group/comment flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-medium text-zinc-500">{displayName(c.author_email)}</span>
                    <p className="text-xs text-zinc-300 leading-snug mt-0.5 break-words">{c.content}</p>
                  </div>
                  {c.author_email === userEmail && (
                    <button
                      onClick={() => onDeleteComment(c.id)}
                      className="opacity-0 group-hover/comment:opacity-100 text-zinc-700 hover:text-red-400 transition-all mt-0.5 shrink-0"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <input
              ref={inputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
              placeholder="Add a comment..."
              className="flex-1 bg-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 border border-zinc-700 focus:border-zinc-500"
            />
            <button
              onClick={submitComment}
              disabled={!newComment.trim()}
              className="p-1.5 rounded-md bg-zinc-700 text-zinc-300 hover:bg-zinc-600 disabled:opacity-40 transition-colors shrink-0"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Idea Edit Panel ───────────────────────────────────────────────────────────

function IdeaEditPanel({
  card, onUpdate, onDelete, onClose,
}: {
  card: StrategyCard;
  onUpdate: (updates: Partial<StrategyCard>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(card.content);
  const [notes, setNotes]     = useState(card.notes ?? "");
  const [status, setStatus]   = useState(card.status);
  const [dirty, setDirty]     = useState(false);

  useEffect(() => { setContent(card.content); setNotes(card.notes ?? ""); setStatus(card.status); setDirty(false); }, [card.id]);

  return (
    <div className="w-72 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Edit idea</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4 flex flex-col gap-4 flex-1">
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Content</label>
          <textarea value={content} onChange={(e) => { setContent(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none transition-colors" rows={3} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Notes</label>
          <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Optional context..." className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none placeholder:text-zinc-600 transition-colors" rows={4} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500">
            {CARD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {displayName(card.author_email) && <p className="text-xs text-zinc-600">Added by {displayName(card.author_email)}</p>}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
        <button onClick={() => { onUpdate({ content, notes, status }); setDirty(false); }} disabled={!dirty} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
      </div>
    </div>
  );
}

// ── Task Board ────────────────────────────────────────────────────────────────

function TaskBoard({ tasks, onAdd, onUpdate, onDelete }: {
  tasks: StrategyTask[];
  onAdd: (status: string, title: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StrategyTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<StrategyTask | null>(null);
  const [adding, setAdding]     = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  async function handleAdd(status: string) {
    if (!newTitle.trim()) return;
    await onAdd(status, newTitle.trim());
    setNewTitle(""); setAdding(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {TASK_STATUSES.map(({ key, label }) => {
        const col = tasks.filter((t) => t.status === key);
        return (
          <div key={key} className="flex-1 min-w-60 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="sh-header text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
              <span className="text-xs text-zinc-700 font-mono">{col.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.map((task) => (
                <div key={task.id} onClick={() => setSelected(task)} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority] ?? "bg-zinc-500")} />
                    <p className="text-sm text-zinc-200 leading-snug flex-1">{task.title}</p>
                  </div>
                  {task.description && <p className="mt-1 ml-3.5 text-xs text-zinc-500 line-clamp-2">{task.description}</p>}
                  {task.assignee && <p className="mt-1.5 ml-3.5 text-[10px] text-zinc-600">{task.assignee}</p>}
                </div>
              ))}
            </div>
            {adding === key ? (
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2.5">
                <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(key); if (e.key === "Escape") { setAdding(null); setNewTitle(""); } }} placeholder="Task title..." className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleAdd(key)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Add</button>
                  <button onClick={() => { setAdding(null); setNewTitle(""); }} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAdding(key); setNewTitle(""); }} className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors">
                <Plus className="h-3 w-3" /> Add task
              </button>
            )}
          </div>
        );
      })}
      {selected && (
        <TaskEditPanel task={selected} onUpdate={(u) => { onUpdate(selected.id, u); setSelected({ ...selected, ...u }); }} onDelete={() => { onDelete(selected.id); setSelected(null); }} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function TaskEditPanel({ task, onUpdate, onDelete, onClose }: {
  task: StrategyTask;
  onUpdate: (updates: Partial<StrategyTask>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle]           = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus]         = useState(task.status);
  const [priority, setPriority]     = useState(task.priority);
  const [assignee, setAssignee]     = useState(task.assignee ?? "");
  const [dirty, setDirty]           = useState(false);

  useEffect(() => { setTitle(task.title); setDescription(task.description ?? ""); setStatus(task.status); setPriority(task.priority); setAssignee(task.assignee ?? ""); setDirty(false); }, [task.id]);

  return (
    <div className="w-72 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Edit task</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="h-4 w-4" /></button>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Title</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 transition-colors" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Description</label>
          <textarea value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} placeholder="Optional details..." className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none placeholder:text-zinc-600 transition-colors" rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-zinc-100 outline-none">
              {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Priority</label>
            <select value={priority} onChange={(e) => { setPriority(e.target.value); setDirty(true); }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-zinc-100 outline-none">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Assignee</label>
          <input value={assignee} onChange={(e) => { setAssignee(e.target.value); setDirty(true); }} placeholder="Name or initials..." className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600 transition-colors" />
        </div>
        {displayName(task.author_email) && <p className="text-xs text-zinc-600">Created by {displayName(task.author_email)}</p>}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
        <button onClick={() => { onUpdate({ title, description, status, priority, assignee }); setDirty(false); }} disabled={!dirty} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Save</button>
      </div>
    </div>
  );
}

// ── Notes Panel ───────────────────────────────────────────────────────────────

function NotesPanel({ notes, onAdd, onUpdate, onDelete }: {
  notes: StrategyNote[];
  onAdd: () => Promise<void>;
  onUpdate: (id: string, updates: Partial<StrategyNote>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notes.length > 0 && !notes.find((n) => n.id === selectedId)) setSelectedId(notes[0].id);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-4" style={{ minHeight: "60vh" }}>
      <div className="w-52 shrink-0 flex flex-col">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-2 mb-3 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> New note
        </button>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {notes.map((note) => (
            <button key={note.id} onClick={() => setSelectedId(note.id)} className={cn("text-left px-3 py-2.5 rounded-lg text-sm transition-colors", selectedId === note.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200")}>
              <div className="truncate font-medium text-sm">{note.title || "Untitled"}</div>
              {note.updated_by_email && <div className="text-[10px] text-zinc-600 mt-0.5">{displayName(note.updated_by_email)}</div>}
            </button>
          ))}
          {notes.length === 0 && <p className="text-xs text-zinc-600 px-3 py-2">No notes yet</p>}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onUpdate={(u) => onUpdate(selected.id, u)} onDelete={() => { onDelete(selected.id); const r = notes.filter((n) => n.id !== selected.id); setSelectedId(r[0]?.id ?? null); }} />
        ) : (
          <div className="flex items-center justify-center h-full rounded-xl border border-zinc-800 bg-zinc-900">
            <p className="text-sm text-zinc-600">Select a note or create one</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ note, onUpdate, onDelete }: {
  note: StrategyNote;
  onUpdate: (updates: Partial<StrategyNote>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle]     = useState(note.title);
  const [content, setContent] = useState(note.content);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function scheduleAutosave(updates: Partial<StrategyNote>) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdate(updates), 800);
  }

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  return (
    <div className="flex flex-col h-full rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <input value={title} onChange={(e) => { setTitle(e.target.value); scheduleAutosave({ title: e.target.value, content }); }} placeholder="Note title" className="flex-1 bg-transparent text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600" />
        <button onClick={onDelete} className="ml-3 text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="h-4 w-4" /></button>
      </div>
      <textarea value={content} onChange={(e) => { setContent(e.target.value); scheduleAutosave({ title, content: e.target.value }); }} placeholder="Start writing..." className="flex-1 px-4 py-3 bg-transparent text-sm text-zinc-300 outline-none resize-none placeholder:text-zinc-600 leading-relaxed" />
      <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between">
        <span className="text-[10px] text-zinc-700">Auto-saves as you type</span>
        {note.updated_by_email && (
          <span className="text-[10px] text-zinc-700">{displayName(note.updated_by_email)} · {new Date(note.updated_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

// ── Moodboard Panel ───────────────────────────────────────────────────────────

function MoodboardPanel({ images, onUpload, onDelete, onUpdateCaption, getSignedUrl }: {
  images: StrategyImage[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string, path: string) => Promise<void>;
  onUpdateCaption: (id: string, caption: string) => Promise<void>;
  getSignedUrl: (path: string) => Promise<string>;
}) {
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const missing = images.filter((img) => !signedUrls[img.storage_path]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (img) => [img.storage_path, await getSignedUrl(img.storage_path)] as [string, string]))
      .then((pairs) => setSignedUrls((p) => { const n = { ...p }; pairs.forEach(([k, v]) => { n[k] = v; }); return n; }));
  }, [images]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith("image/"));
      if (items.length === 0) return;
      setUploading(true);
      await Promise.all(items.map((i) => { const f = i.getAsFile(); return f ? onUpload(f) : Promise.resolve(); }));
      setUploading(false);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onUpload]);

  async function handleFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setUploading(true);
    await Promise.all(imgs.map(onUpload));
    setUploading(false);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={async (e) => { e.preventDefault(); setDragging(false); await handleFiles(Array.from(e.dataTransfer.files)); }}
        className={cn("flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed transition-colors cursor-pointer mb-6", dragging ? "border-zinc-400 bg-zinc-800" : "border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50")}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
        {uploading ? <p className="text-sm text-zinc-500">Uploading...</p> : (
          <>
            <p className="text-sm text-zinc-400">Drop images here or click to browse</p>
            <p className="text-xs text-zinc-600 mt-1">PNG, JPG, GIF, WebP · 10 MB max · Paste also works</p>
          </>
        )}
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-12">No images yet — drag some in</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <ImageCard key={img.id} image={img} signedUrl={signedUrls[img.storage_path]} onDelete={() => onDelete(img.id, img.storage_path)} onUpdateCaption={(c) => onUpdateCaption(img.id, c)} onExpand={() => setLightbox(signedUrls[img.storage_path] ?? null)} />
          ))}
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 transition-colors" onClick={() => setLightbox(null)}><X className="h-6 w-6" /></button>
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function ImageCard({ image, signedUrl, onDelete, onUpdateCaption, onExpand }: {
  image: StrategyImage;
  signedUrl: string | undefined;
  onDelete: () => void;
  onUpdateCaption: (caption: string) => void;
  onExpand: () => void;
}) {
  const [caption, setCaption] = useState(image.caption);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleCaptionChange(val: string) {
    setCaption(val);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdateCaption(val), 800);
  }

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  return (
    <div className="group flex flex-col rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
      <div className="relative aspect-square bg-zinc-800 overflow-hidden cursor-pointer" onClick={onExpand}>
        {signedUrl ? <img src={signedUrl} alt={caption || ""} className="w-full h-full object-cover" /> : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded-lg bg-black/60 p-1.5 text-zinc-300 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-2">
        <input value={caption} onChange={(e) => handleCaptionChange(e.target.value)} placeholder="Add caption..." className="w-full bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600" />
        {image.author_email && <p className="text-[10px] text-zinc-700 mt-0.5">{displayName(image.author_email)}</p>}
      </div>
    </div>
  );
}

// ── Theme Panel ───────────────────────────────────────────────────────────────

const BG_PRESETS = [
  { label: "Default",  value: null        },
  { label: "Midnight", value: "#0a0f1e"   },
  { label: "Forest",   value: "#0d1a0f"   },
  { label: "Plum",     value: "#1a0d2e"   },
  { label: "Slate",    value: "#0f172a"   },
  { label: "Sand",     value: "#faf7f2"   },
];

const TEXT_PRESETS = [
  { label: "Default", value: null        },
  { label: "White",   value: "#f8fafc"   },
  { label: "Cream",   value: "#fef9ef"   },
  { label: "Mint",    value: "#d1fae5"   },
  { label: "Sky",     value: "#bae6fd"   },
  { label: "Black",   value: "#0f172a"   },
];

const HEADER_PRESETS = [
  { label: "Default", value: null        },
  { label: "White",   value: "#ffffff"   },
  { label: "Cream",   value: "#fef9ef"   },
  { label: "Gold",    value: "#fcd34d"   },
  { label: "Sky",     value: "#7dd3fc"   },
  { label: "Black",   value: "#0f172a"   },
];

function ThemePanel({ prefs, onChange, onClose }: {
  prefs: StrategyPrefs;
  onChange: (next: StrategyPrefs) => void;
  onClose: () => void;
}) {
  function set(patch: Partial<StrategyPrefs>) { onChange({ ...prefs, ...patch }); }

  return (
    <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-4 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Theme</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div>
        <p className="text-xs text-zinc-500 mb-2">Mode</p>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => set({ theme: t })} className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors", prefs.theme === t ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200")}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-zinc-500">Background</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-xs text-zinc-600">Custom</span>
            <div className="h-5 w-5 rounded border border-zinc-600 overflow-hidden" style={{ backgroundColor: prefs.bg_color ?? "#09090b" }}>
              <input type="color" value={prefs.bg_color ?? "#09090b"} onChange={(e) => set({ bg_color: e.target.value })} className="opacity-0 w-full h-full cursor-pointer" />
            </div>
          </label>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {BG_PRESETS.map(({ label, value }) => (
            <button key={label} onClick={() => set({ bg_color: value })} title={label} className={cn("h-6 w-6 rounded-md border transition-all", prefs.bg_color === value ? "border-zinc-300 scale-110" : "border-zinc-700 hover:border-zinc-500")} style={{ backgroundColor: value ?? "#09090b" }} />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-zinc-500">Text</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-xs text-zinc-600">Custom</span>
            <div className="h-5 w-5 rounded border border-zinc-600 overflow-hidden" style={{ backgroundColor: prefs.text_color ?? "#f4f4f5" }}>
              <input type="color" value={prefs.text_color ?? "#f4f4f5"} onChange={(e) => set({ text_color: e.target.value })} className="opacity-0 w-full h-full cursor-pointer" />
            </div>
          </label>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TEXT_PRESETS.map(({ label, value }) => (
            <button key={label} onClick={() => set({ text_color: value })} title={label} className={cn("h-6 w-6 rounded-md border transition-all", prefs.text_color === value ? "border-zinc-300 scale-110" : "border-zinc-700 hover:border-zinc-500")} style={{ backgroundColor: value ?? "#f4f4f5" }} />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-zinc-500">Headers</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-xs text-zinc-600">Custom</span>
            <div className="h-5 w-5 rounded border border-zinc-600 overflow-hidden" style={{ backgroundColor: prefs.header_color ?? "#f4f4f5" }}>
              <input type="color" value={prefs.header_color ?? "#f4f4f5"} onChange={(e) => set({ header_color: e.target.value })} className="opacity-0 w-full h-full cursor-pointer" />
            </div>
          </label>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {HEADER_PRESETS.map(({ label, value }) => (
            <button key={label} onClick={() => set({ header_color: value })} title={label} className={cn("h-6 w-6 rounded-md border transition-all", prefs.header_color === value ? "border-zinc-300 scale-110" : "border-zinc-700 hover:border-zinc-500")} style={{ backgroundColor: value ?? "#f4f4f5" }} />
          ))}
        </div>
      </div>
      <button onClick={() => set({ theme: "dark", bg_color: null, text_color: null, header_color: null })} className="w-full py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
        Reset to default
      </button>
    </div>
  );
}
