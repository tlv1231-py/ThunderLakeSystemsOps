"use client";

import { useState, useTransition, useMemo } from "react";
import { createInvoice } from "@/app/(admin)/invoices/actions";
import { formatCurrency, formatDate } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  company_name: string;
  default_hourly_rate: number | null;
  invoice_terms_days: number | null;
};

type TimeEntry = {
  id: string;
  date_worked: string;
  hours_decimal: number;
  description: string | null;
  client_id: string;
  projects: { id: string; name: string; hourly_rate_override: number | null } | null;
  clients: { default_hourly_rate: number | null } | null;
};

type ExpenseEntry = {
  id: string;
  date_incurred: string;
  description: string | null;
  amount: number;
  client_id: string;
};

interface Props {
  clients: Client[];
  timeEntries: TimeEntry[];
  expenseEntries: ExpenseEntry[];
  defaultTaxRate: number;
  defaultTermsDays: number;
  today: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function NewInvoiceForm({
  clients,
  timeEntries,
  expenseEntries,
  defaultTaxRate,
  defaultTermsDays,
  today,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [taxRate, setTaxRate] = useState(defaultTaxRate * 100); // stored as percent
  const [notes, setNotes] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + defaultTermsDays);
    return d.toISOString().split("T")[0];
  });

  // ── Derived data ─────────────────────────────────────────────────────────
  const clientEntries = useMemo(
    () => timeEntries.filter((e) => e.client_id === clientId),
    [timeEntries, clientId]
  );

  const clientExpenses = useMemo(
    () => expenseEntries.filter((e) => e.client_id === clientId),
    [expenseEntries, clientId]
  );

  // When client changes, reset selections
  function handleClientChange(id: string) {
    setClientId(id);
    setSelectedEntries(new Set());
    setSelectedExpenses(new Set());
  }

  function entryRate(e: TimeEntry) {
    return e.projects?.hourly_rate_override ?? e.clients?.default_hourly_rate ?? 0;
  }

  function entryAmount(e: TimeEntry) {
    return e.hours_decimal * entryRate(e);
  }

  const timeSubtotal = useMemo(
    () =>
      clientEntries
        .filter((e) => selectedEntries.has(e.id))
        .reduce((s, e) => s + entryAmount(e), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientEntries, selectedEntries]
  );

  const expenseSubtotal = useMemo(
    () =>
      clientExpenses
        .filter((e) => selectedExpenses.has(e.id))
        .reduce((s, e) => s + e.amount, 0),
    [clientExpenses, selectedExpenses]
  );

  const subtotal    = timeSubtotal + expenseSubtotal;
  const taxAmount   = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  function toggleEntry(id: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleExpense(id: string) {
    setSelectedExpenses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllEntries() {
    setSelectedEntries(new Set(clientEntries.map((e) => e.id)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedEntries.size === 0) {
      setError("Select at least one time entry");
      return;
    }
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      createInvoice(fd).catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to create invoice")
      );
    });
  }

  const hasTimeEntries   = clientEntries.length > 0;
  const hasExpenses      = clientExpenses.length > 0;
  const canSubmit        = selectedEntries.size > 0 && !pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Hidden fields for selected IDs */}
      {Array.from(selectedEntries).map((id) => (
        <input key={id} type="hidden" name="entry_ids" value={id} />
      ))}
      {Array.from(selectedExpenses).map((id) => (
        <input key={id} type="hidden" name="expense_ids" value={id} />
      ))}

      {/* ── Client & Dates ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Invoice Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Client</label>
            <select
              name="client_id"
              value={clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Tax rate (%)</label>
            <input
              name="tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Issue date</label>
            <input
              name="issue_date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Due date</label>
            <input
              name="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Notes <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Payment instructions, thank-you note…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none resize-none"
          />
        </div>
      </section>

      {/* ── Time Entries ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Time Entries
            {selectedEntries.size > 0 && (
              <span className="ml-2 text-zinc-500 font-normal normal-case">
                {selectedEntries.size} selected
              </span>
            )}
          </h2>
          {hasTimeEntries && selectedEntries.size < clientEntries.length && (
            <button
              type="button"
              onClick={selectAllEntries}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Select all
            </button>
          )}
        </div>

        {!hasTimeEntries ? (
          <p className="px-5 py-8 text-sm text-zinc-500 text-center">
            No uninvoiced time entries for this client.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/40">
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Hrs</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Rate</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {clientEntries.map((entry) => {
                const checked = selectedEntries.has(entry.id);
                const rate    = entryRate(entry);
                const amount  = entryAmount(entry);
                return (
                  <tr
                    key={entry.id}
                    className={`cursor-pointer transition-colors ${
                      checked ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"
                    }`}
                    onClick={() => toggleEntry(entry.id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEntry(entry.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
                      {formatDate(entry.date_worked)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {entry.projects?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                      {entry.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-100">
                      {entry.hours_decimal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {rate > 0 ? formatCurrency(rate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">
                      {rate > 0 ? formatCurrency(amount) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Expenses ──────────────────────────────────────────────────────── */}
      {hasExpenses && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Expenses
              {selectedExpenses.size > 0 && (
                <span className="ml-2 text-zinc-500 font-normal normal-case">
                  {selectedExpenses.size} selected
                </span>
              )}
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/40">
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {clientExpenses.map((exp) => {
                const checked = selectedExpenses.has(exp.id);
                return (
                  <tr
                    key={exp.id}
                    className={`cursor-pointer transition-colors ${
                      checked ? "bg-zinc-800/60" : "hover:bg-zinc-800/30"
                    }`}
                    onClick={() => toggleExpense(exp.id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExpense(exp.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-zinc-600 bg-zinc-700 accent-zinc-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums whitespace-nowrap">
                      {formatDate(exp.date_incurred)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                      {exp.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">
                      {formatCurrency(exp.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Totals & Submit ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-end gap-4">
        <div className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Tax ({taxRate.toFixed(2)}%)</span>
              <span className="tabular-nums">{formatCurrency(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-zinc-100 pt-1 border-t border-zinc-800">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create invoice"}
        </button>
      </div>
    </form>
  );
}
