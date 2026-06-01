"use client";

import { useState, useTransition, useMemo } from "react";
import { Pencil, Trash2, Plus, Check, X, Lock } from "lucide-react";
import { upsertExpenseEntry, deleteExpenseEntry } from "@/app/(admin)/expenses/actions";
import { formatCurrency, formatDate } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseEntry = {
  id: string;
  date_incurred: string;
  description: string;
  amount: number;
  currency: string;
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
};

export type Project = {
  id: string;
  client_id: string;
  name: string;
};

// ─── Main wrapper ─────────────────────────────────────────────────────────────

export function ExpenseTable({
  entries,
  clients,
  projects,
}: {
  entries: ExpenseEntry[];
  clients: Client[];
  projects: Project[];
}) {
  const [modalEntry, setModalEntry] = useState<ExpenseEntry | null | "new">(null);

  const totalUninvoiced = entries
    .filter((e) => e.status === "uninvoiced" && e.billable)
    .reduce((s, e) => s + e.amount, 0);

  const statusStyles: Record<string, string> = {
    uninvoiced:  "bg-amber-900/30 text-amber-400",
    invoiced:    "bg-blue-900/30 text-blue-400",
    paid:        "bg-emerald-900/30 text-emerald-400",
    written_off: "bg-zinc-800 text-zinc-500",
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Expenses</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatCurrency(totalUninvoiced)} uninvoiced billable expenses
          </p>
        </div>
        <button
          onClick={() => setModalEntry("new")}
          className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add expense
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No expense entries yet.{" "}
            <button
              onClick={() => setModalEntry("new")}
              className="text-zinc-400 underline underline-offset-2"
            >
              Add your first expense
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {entries.map((entry) => (
                <ExpenseRow
                  key={entry.id}
                  entry={entry}
                  statusStyles={statusStyles}
                  onEdit={() => setModalEntry(entry)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalEntry !== null && (
        <ExpenseEntryModal
          entry={modalEntry === "new" ? null : modalEntry}
          clients={clients}
          projects={projects}
          onClose={() => setModalEntry(null)}
        />
      )}
    </>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function ExpenseRow({
  entry,
  statusStyles,
  onEdit,
}: {
  entry: ExpenseEntry;
  statusStyles: Record<string, string>;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const editable = entry.status === "uninvoiced";

  function handleDelete() {
    if (!confirm("Delete this expense entry?")) return;
    startTransition(() => deleteExpenseEntry(entry.id));
  }

  return (
    <tr className={`group hover:bg-zinc-800/40 transition-colors ${pending ? "opacity-40" : ""}`}>
      <td className="px-4 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
        {formatDate(entry.date_incurred)}
      </td>
      <td className="px-4 py-3 text-zinc-300">
        {entry.clients?.company_name ?? "—"}
      </td>
      <td className="px-4 py-3 text-zinc-400">
        {entry.projects?.name ?? "—"}
      </td>
      <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
        {entry.description}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">
        {formatCurrency(entry.amount, entry.currency)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[entry.status] ?? "bg-zinc-800 text-zinc-500"}`}>
          {entry.status.replace("_", " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        {editable ? (
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              title="Edit"
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleDelete}
              title="Delete"
              disabled={pending}
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

// ─── Modal ────────────────────────────────────────────────────────────────────

function ExpenseEntryModal({
  entry,
  clients,
  projects,
  onClose,
}: {
  entry: ExpenseEntry | null;
  clients: Client[];
  projects: Project[];
  onClose: () => void;
}) {
  const isNew = entry === null;
  const today = new Date().toISOString().split("T")[0];

  const [pending, startTransition]               = useTransition();
  const [addingProject, startAddTransition]      = useTransition();
  const [error, setError]                        = useState<string | null>(null);
  const [clientId, setClientId]                  = useState(entry?.client_id ?? clients[0]?.id ?? "");
  const [selectedProjectId, setSelectedProjectId]= useState(entry?.project_id ?? "");
  const [localProjects, setLocalProjects]        = useState<Project[]>(projects);
  const [showAddProject, setShowAddProject]      = useState(false);
  const [newProjectName, setNewProjectName]      = useState("");
  const [addProjectError, setAddProjectError]    = useState<string | null>(null);

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

  async function handleAddProject() {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setAddProjectError(null);
    const { createProject } = await import("@/app/(admin)/time/actions");
    startAddTransition(async () => {
      try {
        const newProject = await createProject(clientId, trimmed);
        setLocalProjects((prev) => [...prev, { id: newProject.id, client_id: newProject.client_id, name: newProject.name }]);
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
        await upsertExpenseEntry(fd);
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
            {isNew ? "Add Expense" : "Edit Expense"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Date + Amount row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Date</label>
              <input
                name="date_incurred"
                type="date"
                defaultValue={entry?.date_incurred ?? today}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={entry?.amount ?? ""}
                  placeholder="0.00"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-7 pr-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Client */}
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

          {/* Project */}
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

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
            <input
              name="description"
              type="text"
              defaultValue={entry?.description ?? ""}
              placeholder="e.g. AWS bill, software license, travel…"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center gap-3">
            <input type="hidden" name="billable" value="false" />
            <input
              id="billable-exp"
              name="billable"
              type="checkbox"
              value="true"
              defaultChecked={entry?.billable ?? true}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
            />
            <label htmlFor="billable-exp" className="text-sm text-zinc-300 cursor-pointer">Billable</label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50">
              {pending ? "Saving…" : isNew ? "Add expense" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
