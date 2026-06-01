"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { upsertProject, deleteProject } from "@/app/(admin)/projects/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  billing_type: string;
  hourly_rate_override: number | null;
  estimated_hours: number | null;
  is_active: boolean;
  clients: { company_name: string } | null;
  actual_hours: number; // computed server-side
};

export type ClientOption = {
  id: string;
  company_name: string;
};

// ─── Main wrapper ─────────────────────────────────────────────────────────────

export function ProjectsTable({
  projects,
  clients,
}: {
  projects: ProjectRow[];
  clients: ClientOption[];
}) {
  const [modalProject, setModalProject] = useState<ProjectRow | null | "new">(null);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setModalProject("new")}
          className="flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {projects.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No projects yet.{" "}
            <button
              onClick={() => setModalProject("new")}
              className="text-zinc-400 underline underline-offset-2"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Billing</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Hours</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  onEdit={() => setModalProject(p)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalProject !== null && (
        <ProjectModal
          project={modalProject === "new" ? null : modalProject}
          clients={clients}
          onClose={() => setModalProject(null)}
        />
      )}
    </>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  onEdit,
}: {
  project: ProjectRow;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteProject(project.id);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  const billingLabel: Record<string, string> = {
    hourly: "Hourly",
    fixed: "Fixed",
    retainer: "Retainer",
  };

  const actual    = project.actual_hours;
  const estimated = project.estimated_hours;
  const pct       = estimated && estimated > 0 ? actual / estimated : null;

  return (
    <>
      <tr className={`group hover:bg-zinc-800/40 transition-colors ${pending ? "opacity-40" : ""}`}>
        {/* Project name + description */}
        <td className="px-4 py-3">
          <p className="font-medium text-zinc-100">{project.name}</p>
          {project.description && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{project.description}</p>
          )}
        </td>

        {/* Client */}
        <td className="px-4 py-3 text-zinc-400">
          {project.clients?.company_name ?? "—"}
        </td>

        {/* Billing type */}
        <td className="px-4 py-3">
          <span className="text-zinc-400">{billingLabel[project.billing_type] ?? project.billing_type}</span>
          {project.billing_type === "hourly" && project.hourly_rate_override != null && (
            <span className="ml-1.5 text-xs text-zinc-600">
              ${project.hourly_rate_override}/hr
            </span>
          )}
        </td>

        {/* Hours: actual vs estimated */}
        <td className="px-4 py-3">
          <HoursCell actual={actual} estimated={estimated} pct={pct} />
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            project.is_active
              ? "bg-emerald-900/40 text-emerald-400"
              : "bg-zinc-800 text-zinc-500"
          }`}>
            {project.is_active ? "Active" : "Inactive"}
          </span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
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
              disabled={pending}
              title="Delete"
              className="rounded p-1.5 text-zinc-500 hover:bg-red-900/40 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Inline delete error */}
      {deleteError && (
        <tr className="bg-red-950/20">
          <td colSpan={6} className="px-4 py-2 text-xs text-red-400 flex items-center justify-between">
            <span>{deleteError}</span>
            <button onClick={() => setDeleteError(null)} className="ml-3 text-red-500 hover:text-red-300">
              <X className="h-3 w-3" />
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Hours cell ───────────────────────────────────────────────────────────────

function HoursCell({
  actual,
  estimated,
  pct,
}: {
  actual: number;
  estimated: number | null;
  pct: number | null;
}) {
  if (!estimated) {
    return (
      <span className={actual > 0 ? "text-zinc-300 tabular-nums" : "text-zinc-600"}>
        {actual > 0 ? `${actual.toFixed(1)}h` : "—"}
      </span>
    );
  }

  const barColor =
    pct == null    ? "bg-zinc-600"
    : pct > 1      ? "bg-red-500"
    : pct >= 0.8   ? "bg-amber-500"
    : "bg-emerald-500";

  const barWidth = pct != null ? Math.min(pct, 1) * 100 : 0;

  return (
    <div className="space-y-1 min-w-[100px]">
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className={`font-medium ${pct != null && pct > 1 ? "text-red-400" : "text-zinc-100"}`}>
          {actual.toFixed(1)}h
        </span>
        <span className="text-zinc-600 text-xs">/ {estimated.toFixed(0)}h est.</span>
        {pct != null && (
          <span className={`text-xs ${pct > 1 ? "text-red-400" : pct >= 0.8 ? "text-amber-400" : "text-zinc-500"}`}>
            {Math.round(pct * 100)}%
          </span>
        )}
      </div>
      <div className="h-1 w-full rounded-full bg-zinc-800">
        <div
          className={`h-1 rounded-full transition-all ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function ProjectModal({
  project,
  clients,
  onClose,
}: {
  project: ProjectRow | null;
  clients: ClientOption[];
  onClose: () => void;
}) {
  const isNew = project === null;

  const [pending, startTransition]     = useTransition();
  const [error, setError]             = useState<string | null>(null);
  const [billingType, setBillingType] = useState(project?.billing_type ?? "hourly");
  const [isActive, setIsActive]       = useState(project?.is_active ?? true);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!isNew) fd.set("id", project.id);
    fd.set("is_active", isActive ? "true" : "false");
    startTransition(async () => {
      try {
        await upsertProject(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-100">
            {isNew ? "New Project" : "Edit Project"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Project Name</label>
            <input
              name="name"
              type="text"
              defaultValue={project?.name ?? ""}
              required
              placeholder="e.g. Q3 Infrastructure Audit"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Client</label>
            <select
              name="client_id"
              defaultValue={project?.client_id ?? clients[0]?.id ?? ""}
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          {/* Billing Type + Rate row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Billing Type</label>
              <select
                name="billing_type"
                value={billingType}
                onChange={(e) => setBillingType(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              >
                <option value="hourly">Hourly</option>
                <option value="fixed">Fixed</option>
                <option value="retainer">Retainer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {billingType === "hourly" ? "Rate Override" : "Budget"}
                {" "}<span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                <input
                  name="hourly_rate_override"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={project?.hourly_rate_override ?? ""}
                  placeholder={billingType === "hourly" ? "0.00/hr" : "0.00"}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-7 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Estimated Hours */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Estimated Hours <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              name="estimated_hours"
              type="number"
              step="0.5"
              min="0"
              defaultValue={project?.estimated_hours ?? ""}
              placeholder="e.g. 40"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Track actual logged hours against this estimate on the Projects page.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              name="description"
              defaultValue={project?.description ?? ""}
              rows={2}
              placeholder="Scope, goals, notes…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
            />
          </div>

          {/* Active toggle — edit only */}
          {!isNew && (
            <div className="flex items-center gap-3">
              <input
                id="is_active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
              />
              <label htmlFor="is_active" className="text-sm text-zinc-300 cursor-pointer">
                Active
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : isNew ? "Create project" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
