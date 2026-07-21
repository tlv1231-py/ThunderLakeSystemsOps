"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, X, Palette } from "lucide-react";
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
};

// ── Theme CSS injection ────────────────────────────────────────────────────────

function buildThemeCSS(prefs: StrategyPrefs): string {
  const light = prefs.theme === "light";
  const bg    = prefs.bg_color;
  const text  = prefs.text_color;
  let css = "";

  if (light) {
    css += `
      .sh-root .bg-zinc-950{background-color:#f1f5f9!important}
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
    `;
  }

  if (bg) {
    css += `.sh-root .bg-zinc-950{background-color:${bg}!important}`;
  }

  if (text) {
    css += `
      .sh-root .text-zinc-100{color:${text}!important}
      .sh-root .text-zinc-200{color:${text}!important}
      .sh-root .text-zinc-300{color:${text}cc!important}
      .sh-root textarea,.sh-root input[type=text],.sh-root input[type=email]{color:${text}!important}
    `;
  }

  return css;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_CATEGORIES = [
  { key: "business_name", label: "Business Names" },
  { key: "domain",        label: "Domains"        },
  { key: "design",        label: "Design Ideas"   },
  { key: "general",       label: "General"        },
];

const CARD_STATUSES = [
  { key: "idea",        label: "Idea",        cls: "bg-zinc-700 text-zinc-300"         },
  { key: "shortlisted", label: "Shortlisted", cls: "bg-blue-900/60 text-blue-300"     },
  { key: "approved",    label: "Approved",    cls: "bg-emerald-900/60 text-emerald-300" },
  { key: "archived",    label: "Archived",    cls: "bg-zinc-800 text-zinc-600"         },
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

function displayName(email: string) {
  return email ? email.split("@")[0] : "";
}

// ── Main Component ────────────────────────────────────────────────────────────

const DEFAULT_PREFS: StrategyPrefs = { user_id: "", theme: "dark", bg_color: null, text_color: null };

export function StrategyHub({
  initialCards,
  initialTasks,
  initialNotes,
  initialImages,
  initialPrefs,
  userEmail,
  userId,
}: {
  initialCards: StrategyCard[];
  initialTasks: StrategyTask[];
  initialNotes: StrategyNote[];
  initialImages: StrategyImage[];
  initialPrefs: StrategyPrefs | null;
  userEmail: string;
  userId: string;
}) {
  const [tab, setTab] = useState<"ideas" | "tasks" | "notes" | "moodboard">("ideas");
  const [cards, setCards] = useState<StrategyCard[]>(initialCards);
  const [tasks, setTasks] = useState<StrategyTask[]>(initialTasks);
  const [notes, setNotes] = useState<StrategyNote[]>(initialNotes);
  const [images, setImages] = useState<StrategyImage[]>(initialImages);
  const [prefs, setPrefs] = useState<StrategyPrefs>(initialPrefs ?? { ...DEFAULT_PREFS, user_id: userId });
  const [themeOpen, setThemeOpen] = useState(false);
  const supabase = createClient();
  const db = supabase as unknown as SupabaseClient;

  const themeCSS = useMemo(() => buildThemeCSS(prefs), [prefs]);

  const savePrefs = useCallback(async (next: StrategyPrefs) => {
    setPrefs(next);
    await db.from("strategy_preferences").upsert({ ...next, user_id: userId });
  }, [db, userId]);

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    const channel = (supabase as any)
      .channel("strategy-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_cards" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setCards((p) => [payload.new as StrategyCard, ...p]);
        } else if (payload.eventType === "UPDATE") {
          setCards((p) => p.map((c) => c.id === payload.new.id ? payload.new as StrategyCard : c));
        } else if (payload.eventType === "DELETE") {
          setCards((p) => p.filter((c) => c.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_tasks" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setTasks((p) => [payload.new as StrategyTask, ...p]);
        } else if (payload.eventType === "UPDATE") {
          setTasks((p) => p.map((t) => t.id === payload.new.id ? payload.new as StrategyTask : t));
        } else if (payload.eventType === "DELETE") {
          setTasks((p) => p.filter((t) => t.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_notes" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setNotes((p) => [payload.new as StrategyNote, ...p]);
        } else if (payload.eventType === "UPDATE") {
          setNotes((p) => p.map((n) => n.id === payload.new.id ? payload.new as StrategyNote : n));
        } else if (payload.eventType === "DELETE") {
          setNotes((p) => p.filter((n) => n.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "strategy_images" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setImages((p) => [payload.new as StrategyImage, ...p]);
        } else if (payload.eventType === "UPDATE") {
          setImages((p) => p.map((i) => i.id === payload.new.id ? payload.new as StrategyImage : i));
        } else if (payload.eventType === "DELETE") {
          setImages((p) => p.filter((i) => i.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Card CRUD ─────────────────────────────────────────────────────────────
  async function addCard(category: string, content: string) {
    await db.from("strategy_cards").insert({ category, content, notes: "", status: "idea", author_email: userEmail });
  }
  async function updateCard(id: string, updates: Partial<StrategyCard>) {
    await db.from("strategy_cards").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteCard(id: string) {
    await db.from("strategy_cards").delete().eq("id", id);
  }

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  async function addTask(status: string, title: string) {
    await db.from("strategy_tasks").insert({ title, status, description: "", priority: "medium", assignee: "", author_email: userEmail });
  }
  async function updateTask(id: string, updates: Partial<StrategyTask>) {
    await db.from("strategy_tasks").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteTask(id: string) {
    await db.from("strategy_tasks").delete().eq("id", id);
  }

  // ── Note CRUD ─────────────────────────────────────────────────────────────
  async function addNote() {
    await db.from("strategy_notes").insert({ title: "Untitled", content: "", updated_by_email: userEmail });
  }
  async function updateNote(id: string, updates: Partial<StrategyNote>) {
    await db.from("strategy_notes").update({ ...updates, updated_at: new Date().toISOString(), updated_by_email: userEmail }).eq("id", id);
  }
  async function deleteNote(id: string) {
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

  return (
    <div className="sh-root flex flex-col" style={{ minHeight: "calc(100vh - 10rem)" }}>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Strategy Hub</h1>
          <p className="mt-1 text-sm text-zinc-500">Shared workspace · Thunder Lake</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setThemeOpen((o) => !o)}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Customize theme"
          >
            <Palette className="h-4 w-4" />
          </button>
          {themeOpen && (
            <ThemePanel
              prefs={prefs}
              onChange={savePrefs}
              onClose={() => setThemeOpen(false)}
            />
          )}
        </div>
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
            onAdd={addCard}
            onUpdate={updateCard}
            onDelete={deleteCard}
          />
        )}
        {tab === "tasks" && (
          <TaskBoard
            tasks={tasks}
            onAdd={addTask}
            onUpdate={updateTask}
            onDelete={deleteTask}
          />
        )}
        {tab === "notes" && (
          <NotesPanel
            notes={notes}
            onAdd={addNote}
            onUpdate={updateNote}
            onDelete={deleteNote}
          />
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
  );
}

// ── Ideas Board ───────────────────────────────────────────────────────────────

function IdeasBoard({
  cards, onAdd, onUpdate, onDelete,
}: {
  cards: StrategyCard[];
  onAdd: (category: string, content: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StrategyCard>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<StrategyCard | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [newContent, setNewContent] = useState("");

  async function handleAdd(category: string) {
    if (!newContent.trim()) return;
    await onAdd(category, newContent.trim());
    setNewContent("");
    setAdding(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {CARD_CATEGORIES.map(({ key, label }) => {
        const colCards = cards.filter((c) => c.category === key);
        return (
          <div key={key} className="flex-1 min-w-52 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
              <span className="text-xs text-zinc-700 font-mono">{colCards.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {colCards.map((card) => {
                const statusInfo = CARD_STATUSES.find((s) => s.key === card.status) ?? CARD_STATUSES[0];
                return (
                  <div
                    key={card.id}
                    className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-3 cursor-pointer hover:border-zinc-700 transition-colors"
                    onClick={() => setSelected(card)}
                  >
                    <p className="text-sm text-zinc-200 leading-snug pr-4">{card.content}</p>
                    {card.notes && (
                      <p className="mt-1 text-xs text-zinc-500 leading-snug line-clamp-2">{card.notes}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusInfo.cls)}>
                        {statusInfo.label}
                      </span>
                      {displayName(card.author_email) && (
                        <span className="text-[10px] text-zinc-700">{displayName(card.author_email)}</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
                      className="absolute top-2 right-2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {adding === key ? (
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2.5">
                <textarea
                  autoFocus
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(key); }
                    if (e.key === "Escape") { setAdding(null); setNewContent(""); }
                  }}
                  placeholder="Type and press Enter..."
                  rows={2}
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleAdd(key)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">
                    Add
                  </button>
                  <button onClick={() => { setAdding(null); setNewContent(""); }} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(key); setNewContent(""); }}
                className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add idea
              </button>
            )}
          </div>
        );
      })}

      {/* Edit panel */}
      {selected && (
        <IdeaEditPanel
          card={selected}
          onUpdate={(updates) => {
            onUpdate(selected.id, updates);
            setSelected({ ...selected, ...updates });
          }}
          onDelete={() => { onDelete(selected.id); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function IdeaEditPanel({
  card, onUpdate, onDelete, onClose,
}: {
  card: StrategyCard;
  onUpdate: (updates: Partial<StrategyCard>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(card.content);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [status, setStatus] = useState(card.status);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setContent(card.content);
    setNotes(card.notes ?? "");
    setStatus(card.status);
    setDirty(false);
  }, [card.id]);

  return (
    <div className="w-72 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Edit idea</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-4 flex-1">
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Content</label>
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none transition-colors"
            rows={3}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            placeholder="Optional context..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none placeholder:text-zinc-600 transition-colors"
            rows={4}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          >
            {CARD_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        {displayName(card.author_email) && (
          <p className="text-xs text-zinc-600">Added by {displayName(card.author_email)}</p>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400 transition-colors">
          Delete
        </button>
        <button
          onClick={() => { onUpdate({ content, notes, status }); setDirty(false); }}
          disabled={!dirty}
          className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Task Board ────────────────────────────────────────────────────────────────

function TaskBoard({
  tasks, onAdd, onUpdate, onDelete,
}: {
  tasks: StrategyTask[];
  onAdd: (status: string, title: string) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StrategyTask>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<StrategyTask | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  async function handleAdd(status: string) {
    if (!newTitle.trim()) return;
    await onAdd(status, newTitle.trim());
    setNewTitle("");
    setAdding(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {TASK_STATUSES.map(({ key, label }) => {
        const colTasks = tasks.filter((t) => t.status === key);
        return (
          <div key={key} className="flex-1 min-w-60 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
              <span className="text-xs text-zinc-700 font-mono">{colTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelected(task)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 cursor-pointer hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority] ?? "bg-zinc-500")} />
                    <p className="text-sm text-zinc-200 leading-snug flex-1">{task.title}</p>
                  </div>
                  {task.description && (
                    <p className="mt-1 ml-3.5 text-xs text-zinc-500 line-clamp-2">{task.description}</p>
                  )}
                  {task.assignee && (
                    <p className="mt-1.5 ml-3.5 text-[10px] text-zinc-600">{task.assignee}</p>
                  )}
                </div>
              ))}
            </div>
            {adding === key ? (
              <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2.5">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd(key);
                    if (e.key === "Escape") { setAdding(null); setNewTitle(""); }
                  }}
                  placeholder="Task title..."
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleAdd(key)} className="px-2.5 py-1 rounded bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 transition-colors">Add</button>
                  <button onClick={() => { setAdding(null); setNewTitle(""); }} className="px-2.5 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAdding(key); setNewTitle(""); }}
                className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add task
              </button>
            )}
          </div>
        );
      })}

      {selected && (
        <TaskEditPanel
          task={selected}
          onUpdate={(updates) => {
            onUpdate(selected.id, updates);
            setSelected({ ...selected, ...updates });
          }}
          onDelete={() => { onDelete(selected.id); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TaskEditPanel({
  task, onUpdate, onDelete, onClose,
}: {
  task: StrategyTask;
  onUpdate: (updates: Partial<StrategyTask>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setAssignee(task.assignee ?? "");
    setDirty(false);
  }, [task.id]);

  return (
    <div className="w-72 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Edit task</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Title</label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="Optional details..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 resize-none placeholder:text-zinc-600 transition-colors"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-zinc-100 outline-none"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Priority</label>
            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setDirty(true); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1.5 block">Assignee</label>
          <input
            value={assignee}
            onChange={(e) => { setAssignee(e.target.value); setDirty(true); }}
            placeholder="Name or initials..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600 transition-colors"
          />
        </div>
        {displayName(task.author_email) && (
          <p className="text-xs text-zinc-600">Created by {displayName(task.author_email)}</p>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
        <button
          onClick={() => { onUpdate({ title, description, status, priority, assignee }); setDirty(false); }}
          disabled={!dirty}
          className="px-3 py-1.5 rounded-lg bg-zinc-700 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Notes Panel ───────────────────────────────────────────────────────────────

function NotesPanel({
  notes, onAdd, onUpdate, onDelete,
}: {
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

  async function handleAdd() {
    await onAdd();
    // Real-time INSERT will update notes; we'll select the newest on next render
  }

  useEffect(() => {
    // Auto-select newly added note (it'll appear first)
    if (notes.length > 0 && !notes.find((n) => n.id === selectedId)) {
      setSelectedId(notes[0].id);
    }
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-4" style={{ minHeight: "60vh" }}>
      {/* Sidebar list */}
      <div className="w-52 shrink-0 flex flex-col">
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-2 mb-3 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New note
        </button>
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedId(note.id)}
              className={cn(
                "text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                selectedId === note.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
              )}
            >
              <div className="truncate font-medium text-sm">{note.title || "Untitled"}</div>
              {note.updated_by_email && (
                <div className="text-[10px] text-zinc-600 mt-0.5">{displayName(note.updated_by_email)}</div>
              )}
            </button>
          ))}
          {notes.length === 0 && (
            <p className="text-xs text-zinc-600 px-3 py-2">No notes yet</p>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onUpdate={(updates) => onUpdate(selected.id, updates)}
            onDelete={() => {
              onDelete(selected.id);
              const remaining = notes.filter((n) => n.id !== selected.id);
              setSelectedId(remaining[0]?.id ?? null);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full rounded-xl border border-zinc-800 bg-zinc-900">
            <p className="text-sm text-zinc-600">Select a note or create one</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Moodboard Panel ───────────────────────────────────────────────────────────

function MoodboardPanel({
  images, onUpload, onDelete, onUpdateCaption, getSignedUrl,
}: {
  images: StrategyImage[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string, path: string) => Promise<void>;
  onUpdateCaption: (id: string, caption: string) => Promise<void>;
  getSignedUrl: (path: string) => Promise<string>;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Map from storage_path → signed URL (expires in 1h)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate signed URLs for all images on mount and when new images arrive
  useEffect(() => {
    const missing = images.filter((img) => !signedUrls[img.storage_path]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (img) => {
        const url = await getSignedUrl(img.storage_path);
        return [img.storage_path, url] as [string, string];
      })
    ).then((pairs) => {
      setSignedUrls((prev) => {
        const next = { ...prev };
        pairs.forEach(([path, url]) => { next[path] = url; });
        return next;
      });
    });
  }, [images]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clipboard paste support
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((i) => i.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      setUploading(true);
      await Promise.all(imageItems.map((item) => {
        const file = item.getAsFile();
        return file ? onUpload(file) : Promise.resolve();
      }));
      setUploading(false);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onUpload]);

  async function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading(true);
    await Promise.all(images.map(onUpload));
    setUploading(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    await handleFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed transition-colors cursor-pointer mb-6",
          dragging
            ? "border-zinc-400 bg-zinc-800"
            : "border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
        />
        {uploading ? (
          <p className="text-sm text-zinc-500">Uploading...</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Drop images here or click to browse</p>
            <p className="text-xs text-zinc-600 mt-1">PNG, JPG, GIF, WebP · 10 MB max · Paste also works</p>
          </>
        )}
      </div>

      {/* Image grid */}
      {images.length === 0 ? (
        <p className="text-sm text-zinc-600 text-center py-12">No images yet — drag some in</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              signedUrl={signedUrls[img.storage_path]}
              onDelete={() => onDelete(img.id, img.storage_path)}
              onUpdateCaption={(caption) => onUpdateCaption(img.id, caption)}
              onExpand={() => setLightbox(signedUrls[img.storage_path] ?? null)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function ImageCard({
  image, signedUrl, onDelete, onUpdateCaption, onExpand,
}: {
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
      {/* Image area */}
      <div className="relative aspect-square bg-zinc-800 overflow-hidden cursor-pointer" onClick={onExpand}>
        {signedUrl ? (
          <img src={signedUrl} alt={caption || ""} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-zinc-400 animate-spin" />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg bg-black/60 p-1.5 text-zinc-300 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Caption + author */}
      <div className="p-2">
        <input
          value={caption}
          onChange={(e) => handleCaptionChange(e.target.value)}
          placeholder="Add caption..."
          className="w-full bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600"
        />
        {image.author_email && (
          <p className="text-[10px] text-zinc-700 mt-0.5">{displayName(image.author_email)}</p>
        )}
      </div>
    </div>
  );
}

// ── Theme Panel ───────────────────────────────────────────────────────────────

const BG_PRESETS = [
  { label: "Default", value: null },
  { label: "Midnight", value: "#0a0f1e" },
  { label: "Forest",   value: "#0d1a0f" },
  { label: "Plum",     value: "#1a0d2e" },
  { label: "Slate",    value: "#0f172a" },
  { label: "Sand",     value: "#faf7f2" },
];

const TEXT_PRESETS = [
  { label: "Default", value: null },
  { label: "White",   value: "#f8fafc" },
  { label: "Cream",   value: "#fef9ef" },
  { label: "Mint",    value: "#d1fae5" },
  { label: "Sky",     value: "#bae6fd" },
  { label: "Black",   value: "#0f172a" },
];

function ThemePanel({
  prefs, onChange, onClose,
}: {
  prefs: StrategyPrefs;
  onChange: (next: StrategyPrefs) => void;
  onClose: () => void;
}) {
  function set(patch: Partial<StrategyPrefs>) {
    onChange({ ...prefs, ...patch });
  }

  return (
    <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-4 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Theme</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Light / Dark */}
      <div>
        <p className="text-xs text-zinc-500 mb-2">Mode</p>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => set({ theme: t })}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                prefs.theme === t
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Background color */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-zinc-500">Background</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-xs text-zinc-600">Custom</span>
            <div
              className="h-5 w-5 rounded border border-zinc-600 overflow-hidden"
              style={{ backgroundColor: prefs.bg_color ?? "#09090b" }}
            >
              <input
                type="color"
                value={prefs.bg_color ?? "#09090b"}
                onChange={(e) => set({ bg_color: e.target.value })}
                className="opacity-0 w-full h-full cursor-pointer"
              />
            </div>
          </label>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {BG_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => set({ bg_color: value })}
              title={label}
              className={cn(
                "h-6 w-6 rounded-md border transition-all",
                prefs.bg_color === value
                  ? "border-zinc-300 scale-110"
                  : "border-zinc-700 hover:border-zinc-500"
              )}
              style={{ backgroundColor: value ?? "#09090b" }}
            />
          ))}
        </div>
      </div>

      {/* Text color */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-zinc-500">Text</p>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-xs text-zinc-600">Custom</span>
            <div
              className="h-5 w-5 rounded border border-zinc-600 overflow-hidden"
              style={{ backgroundColor: prefs.text_color ?? "#f4f4f5" }}
            >
              <input
                type="color"
                value={prefs.text_color ?? "#f4f4f5"}
                onChange={(e) => set({ text_color: e.target.value })}
                className="opacity-0 w-full h-full cursor-pointer"
              />
            </div>
          </label>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TEXT_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => set({ text_color: value })}
              title={label}
              className={cn(
                "h-6 w-6 rounded-md border transition-all",
                prefs.text_color === value
                  ? "border-zinc-300 scale-110"
                  : "border-zinc-700 hover:border-zinc-500"
              )}
              style={{ backgroundColor: value ?? "#f4f4f5" }}
            />
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => set({ theme: "dark", bg_color: null, text_color: null })}
        className="w-full py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        Reset to default
      </button>
    </div>
  );
}

function NoteEditor({
  note, onUpdate, onDelete,
}: {
  note: StrategyNote;
  onUpdate: (updates: Partial<StrategyNote>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
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
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleAutosave({ title: e.target.value, content });
          }}
          placeholder="Note title"
          className="flex-1 bg-transparent text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button
          onClick={onDelete}
          className="ml-3 text-zinc-600 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          scheduleAutosave({ title, content: e.target.value });
        }}
        placeholder="Start writing..."
        className="flex-1 px-4 py-3 bg-transparent text-sm text-zinc-300 outline-none resize-none placeholder:text-zinc-600 leading-relaxed"
      />
      <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between">
        <span className="text-[10px] text-zinc-700">Auto-saves as you type</span>
        {note.updated_by_email && (
          <span className="text-[10px] text-zinc-700">
            {displayName(note.updated_by_email)} · {new Date(note.updated_at).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
