"use client";

import { useState, useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, X } from "lucide-react";
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

export function StrategyHub({
  initialCards,
  initialTasks,
  initialNotes,
  userEmail,
}: {
  initialCards: StrategyCard[];
  initialTasks: StrategyTask[];
  initialNotes: StrategyNote[];
  userEmail: string;
}) {
  const [tab, setTab] = useState<"ideas" | "tasks" | "notes">("ideas");
  const [cards, setCards] = useState<StrategyCard[]>(initialCards);
  const [tasks, setTasks] = useState<StrategyTask[]>(initialTasks);
  const [notes, setNotes] = useState<StrategyNote[]>(initialNotes);
  const supabase = createClient();
  const db = supabase as unknown as SupabaseClient;

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

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 10rem)" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Strategy Hub</h1>
        <p className="mt-1 text-sm text-zinc-500">Shared workspace · Thunder Lake</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-zinc-800">
        {(["ideas", "tasks", "notes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium capitalize -mb-px border-b-2 transition-colors",
              tab === t
                ? "border-zinc-100 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t === "ideas" ? "Ideas Board" : t === "tasks" ? "Tasks" : "Notes"}
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
