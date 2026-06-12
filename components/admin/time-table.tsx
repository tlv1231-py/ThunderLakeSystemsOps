"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Pencil, Trash2, Plus, Check, X, Lock } from "lucide-react";
import {
  upsertTimeEntry,
  deleteTimeEntry,
  createProject,
  updateTimeEntryProject,
  updateTimeEntryDescription,
} from "@/app/(admin)/time/actions";
import { formatDate } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TimeEntry = {
  id: string;
  date_worked: string;
  hours_decimal: number;
  description: string | null;
  billable: boolean;
  status: string;
  client_id: string;
  project_id: string | null;
  invoice_id: string | null;
  clients: { company_name: string } | null;
  projects: { name: string } | null;
};

export type Client = {
  id: string;
  company_name: string;
  default_hourly_rate: number | null;
};

export type Project = {
  id: string;
  client_id: string;
  name: string;
  hourly_rate_override: number | null;
};

const ADD_NEW = "__ADD_NEW__";

// ─── Main wrapper ────────────────────────────────────────────────────────────────

export function TimeTable({
  entries,
  clients,
  projects,
}: {
  entries: TimeEntry[];
  clients: Client[];
  projects: Project[];
}) {
  const [modalEntry, setModalEntry] = useState<TimeEntry | null | "new">(null);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Time</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {entries
              .filter((e) => e.status === "uninvoiced" && e.billable)
              .reduce((s, e) => s + e.hours_decimal, 0)
              .toFixed(1)}{" "}
            uninvoiced billable hours
          </p>
        </div>
        <button
          onClick={() => setModalEntry("new")}
          className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Log time
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No time entries yet.{" "}
            <button
              onClick={() => setModalEntry("new")}
              className="text-zinc-400 underline underline-offset-2"
            >
              Log your first entry
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400 whitespace-nowrap">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400 whitespace-nowrap">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400 whitespace-nowrap">Hours</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.map((entry) => (
                <TimeRow
                  key={entry.id}
                  entry={entry}
                  projects={projects}
                  onEdit={() => setModalEntry(entry)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalEntry !== null && (
        <TimeEntryModal
          entry={modalEntry === "new" ? null : modalEntry}
          clients={clients}
          projects={projects}
          onClose={() => setModalEntry(null)}
        />
      )}
    </>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────────

function TimeRow({
  entry,
  projects,
  onEdit,
}: {
  entry: TimeEntry;
  projects: Project[];
  onEdit: () => void;
}) {
  const [deletePending,  startDeleteTransition]  = useTransition();
  const [projectPending, startProjectTransition] = useTransition();
  const [descPending,    startDescTransition]    = useTransition();
  const [addPending,     startAddTransition]     = useTransition();

  // Project state
  const [selectedProjectId, setSelectedProjectId] = useState(entry.project_id ?? "");
  const [showAddProject,    setShowAddProject]     = useState(false);
  const [newProjectName,    setNewProjectName]     = useState("");
  const [addError,          setAddError]           = useState<string | null>(null);

  // Description inline-edit state
  const [descMode,  setDescMode]  = useState<"view" | "edit">("view");
  const [descValue, setDescValue] = useState(entry.description ?? "");

  // Keep descValue in sync when RSC pushes updated entry props (e.g. after save)
  useEffect(() => {
    if (descMode === "view") setDescValue(entry.description ?? "");
  }, [entry.description, descMode]);

  // Keep selectedProjectId in sync after RSC refresh
  useEffect(() => {
    setSelectedProjectId(entry.project_id ?? "");
  }, [entry.project_id]);

  const editable = entry.status === "uninvoiced";

  const clientProjects = useMemo(
    () => projects.filter((p) => p.client_id === entry.client_id),
    [projects, entry.client_id]
  );

  const statusStyles: Record<string, string> = {
    uninvoiced:  "bg-amber-900/30 text-amber-400",
    invoiced:    "bg-blue-900/30 text-blue-400",
    paid:        "bg-emerald-900/30 text-emerald-400",
    written_off: "bg-zinc-800 text-zinc-500",
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleDelete() {
    if (!confirm("Delete this time entry?")) return;
    startDeleteTransition(() => deleteTimeEntry(entry.id));
  }

  function handleProjectChange(value: string) {
    if (value === ADD_NEW) {
      setShowAddProject(true);
      return;
    }
    setSelectedProjectId(value);
    startProjectTransition(async () => {
      await updateTimeEntryProject(entry.id, value || null);
    });
  }

  function handleAddProject() {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setAddError(null);
    startAddTransition(async () => {
      try {
        const newProject = await createProject(entry.client_id, trimmed);
        setSelectedProjectId(newProject.id);
        setShowAddProject(false);
        setNewProjectName("");
        await updateTimeEntryProject(entry.id, newProject.id);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Failed to create project");
      }
    });
  }

  function saveDescription() {
    const trimmed = descValue.trim() || null;
    setDescMode("view");
    if (trimmed === (entry.description ?? null)) return;
    startDescTransition(async () => {
      try {
        await updateTimeEntryDescription(entry.id, trimmed);
      } catch {
        setDescValue(entry.description ?? "");
      }
    });
  }

  // ── Project cell ─────────────────────────────────────────────────────────────

  function renderProject() {
    if (!editable) {
      return <span className="text-zinc-400 text-xs">{entry.projects?.name ?? "—"}</span>;
    }

    if (showAddProject) {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleAddProject(); }
                if (e.key === "Escape") { setShowAddProject(false); setNewProjectName(""); setAddError(null); }
              }}
              placeholder="Project name"
              autoFocus
              disabled={addPending}
              className="w-28 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddProject}
              disabled={!newProjectName.trim() || addPending}
              className="text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors"
            >
              {addPending ? <span className="text-zinc-500 text-xs">…</span> : <Check className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddProject(false); setNewProjectName(""); setAddError(null); }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
        </div>
      );
    }

    return (
      <select
        value={selectedProjectId}
        onChange={(e) => handleProjectChange(e.target.value)}
        disabled={projectPending}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 focus:border-zinc-500 focus:outline-none disabled:opacity-50 cursor-pointer"
      >
        <option value="">— No project —</option>
        {clientProjects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option disabled>──────────</option>
        <option value={ADD_NEW}>＋ New project…</option>
      </select>
    );
  }

  // ── Description cell ─────────────────────────────────────────────────────────

  function renderDescription() {
    if (!editable) {
      return (
        <span className="text-zinc-400 whitespace-normal break-words">
          {entry.description ?? <span className="text-zinc-600 italic">no description</span>}
        </span>
      );
    }

    if (descMode === "edit") {
      return (
        <input
          type="text"
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={saveDescription}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveDescription(); }
            if (e.key === "Escape") { setDescValue(entry.description ?? ""); setDescMode("view"); }
          }}
          autoFocus
          disabled={descPending}
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none"
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => setDescMode("edit")}
        title="Click to edit"
        className="text-left w-full whitespace-normal break-words text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {descPending
          ? <span className="text-zinc-500 italic text-xs">Saving…</span>
          : entry.description
          ? entry.description
          : <span className="text-zinc-600 italic text-xs">add description</span>}
      </button>
    );
  }

  return (
    <tr className={`group hover:bg-zinc-800/40 transition-colors ${deletePending ? "opacity-40" : ""}`}>
      <td className="px-4 py-3 text-zinc-400 tabular-nums whitespace-nowrap align-top pt-4">
        {formatDate(entry.date_worked)}
      </td>
      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap align-top pt-4">
        {entry.clients?.company_name ?? "—"}
      </td>
      <td className="px-4 py-3 align-top pt-3 min-w-[160px]">
        {renderProject()}
      </td>
      <td className="px-4 py-3 align-top pt-4 w-full">
        {renderDescription()}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100 whitespace-nowrap align-top pt-4">
        {entry.hours_decimal.toFixed(2)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap align-top pt-4">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[entry.status] ?? "bg-zinc-800 text-zinc-500"}`}>
          {entry.status.replace("_", " ")}
        </span>
      </td>
      <td className="px-4 py-3 align-top pt-3">
        {editable ? (
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              title="Edit all fields"
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              title="Delete"
              disabled={deletePending}
              className="rounded p-1.5 text-zinc-500 hover:bg-red-900/40 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <span title="Attached to invoice — cannot edit">
              <Lock className="h-3 w-3 text-zinc-700" />
            </span>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────────

function TimeEntryModal({
  entry,
  clients,
  projects,
  onClose,
}: {
  entry: TimeEntry | null;
  clients: Client[];
  projects: Project[];
  onClose: () => void;
}) {
  const isNew = entry === null;
  const today = new Date().toISOString().split("T")[0];

  const [pending, startTransition]           = useTransition();
  const [addingProject, startAddTransition]  = useTransition();
  const [error, setError]                    = useState<string | null>(null);

  const [clientId, setClientId]                   = useState(entry?.client_id ?? clients[0]?.id ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(entry?.project_id ?? "");
  const [localProjects, setLocalProjects]         = useState<Project[]>(projects);
  const [showAddProject, setShowAddProject]       = useState(false);
  const [newProjectName, setNewProjectName]       = useState("");
  const [addProjectError, setAddProjectError]     = useState<string | null>(null);

  const clientProjects = useMemo(
    () => localProjects.filter((p) => p.client_id === clientId),
    [localProjects, clientId]
  );

  function handleClientChange(newClientId: string) {
    setClientId(newClientId);
    setSelectedProjectId("");
    setShowAddProject(false);
    setNewProjectName("");
    setAddProjectError(null);
  }

  function handleAddProject() {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setAddProjectError(null);
    startAddTransition(async () => {
      try {
        const newProject = await createProject(clientId, trimmed);
        setLocalProjects((prev) => [...prev, newProject]);
        setSelectedProjectId(newProject.id);
        setShowAddProject(false);
        setNewProjectName("");
      } catch (err) {
        setAddProjectError(err instanceof Error ? err.message : "Failed to create project");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!isNew) fd.set("id", entry.id);
    fd.set("project_id", selectedProjectId);
    startTransition(async () => {
      try {
        await upsertTimeEntry(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">

        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-100">
            {isNew ? "Log Time" : "Edit Time Entry"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Date</label>
              <input
                name="date_worked"
                type="date"
                defaultValue={entry?.date_worked ?? today}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Hours</label>
              <input
                name="hours_decimal"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                defaultValue={entry?.hours_decimal ?? ""}
                placeholder="0.00"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Client</label>
            <select
              name="client_id"
              value={clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-zinc-300">
                Project <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              {!showAddProject && (
                <button
                  type="button"
                  onClick={() => { setShowAddProject(true); setAddProjectError(null); }}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  New project
                </button>
              )}
            </div>
            {showAddProject ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleAddProject(); }
                      if (e.key === "Escape") { setShowAddProject(false); setNewProjectName(""); }
                    }}
                    placeholder="Project name"
                    autoFocus
                    className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-none"
                  />
                  <button type="button" onClick={handleAddProject} disabled={!newProjectName.trim() || addingProject}
                    className="rounded-lg bg-zinc-700 px-3 py-2 text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-40">
                    {addingProject ? <span className="text-xs px-1">…</span> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => { setShowAddProject(false); setNewProjectName(""); setAddProjectError(null); }}
                    className="rounded-lg px-3 py-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {addProjectError && <p className="text-xs text-red-400">{addProjectError}</p>}
              </div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              >
                <option value="">— No project —</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              name="description"
              defaultValue={entry?.description ?? ""}
              rows={2}
              placeholder="What did you work on?"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="billable"
              name="billable"
              type="checkbox"
              value="true"
              defaultChecked={entry?.billable ?? true}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
            />
            <label htmlFor="billable" className="text-sm text-zinc-300 cursor-pointer">Billable</label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50">
              {pending ? "Saving…" : isNew ? "Log time" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
