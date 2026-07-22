"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { sendAllDraftInvoices } from "@/app/(admin)/invoices/actions";
import { formatCurrency } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DraftInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  client_name: string;
}

export interface UnbilledClient {
  client_id: string;
  client_name: string;
  hours: number;
  amount: number;
}

export interface HistoricalInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  balance_due: number;
  client_name: string;
}

export interface MonthSummary {
  year: number;
  month: number; // 0-indexed (Jan = 0)
  label: string; // "May 2026"
  invoices: HistoricalInvoice[];     // non-draft, non-void invoices issued this month
  unbilledClients: UnbilledClient[]; // still-uninvoiced billable time from this month
}

interface Props {
  draftInvoices: DraftInvoice[];
  unbilledClients: UnbilledClient[];
  daysUntilMonthEnd: number;
  monthEndLabel: string; // "June 30"
  monthLabel: string;    // "June 2026"
  monthStart: string;    // "2026-06-01"
  monthEnd: string;      // "2026-06-30"
  monthHistory: MonthSummary[]; // index 0 = most recent past month (current − 1)
}

// ─── Invoice status badge classes ────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  sent:    "bg-blue-900/40 text-blue-400",
  viewed:  "bg-indigo-900/40 text-indigo-400",
  partial: "bg-amber-900/40 text-amber-400",
  paid:    "bg-emerald-900/40 text-emerald-400",
  overdue: "bg-red-900/40 text-red-400",
};

// ─── Main widget ─────────────────────────────────────────────────────────────────

export function InvoiceCycleWidget({
  draftInvoices,
  unbilledClients,
  daysUntilMonthEnd,
  monthEndLabel,
  monthLabel,
  monthStart,
  monthEnd,
  monthHistory,
}: Props) {
  // 0 = current month; -1 = previous; -2 = two months ago; …
  const [offset, setOffset] = useState(0);

  const canGoBack    = offset > -monthHistory.length;
  const canGoForward = offset < 0;

  const historicalSummary = offset < 0 ? (monthHistory[-offset - 1] ?? null) : null;
  const displayLabel      = historicalSummary?.label ?? monthLabel;

  // Current-month derived state
  const hasDrafts   = offset === 0 && draftInvoices.length > 0;
  const allBilled   = offset === 0 && !hasDrafts && unbilledClients.length === 0;

  // Historical-month derived state
  const histHasSent     = !!historicalSummary && historicalSummary.invoices.length > 0;
  const histHasUnbilled = !!historicalSummary && historicalSummary.unbilledClients.length > 0;

  // Outer container style shifts to blue when drafts are ready
  const outerClass   = hasDrafts ? "border-blue-800/50 bg-blue-950/30" : "border-zinc-800 bg-zinc-900";
  const dividerClass = hasDrafts ? "border-blue-800/30"               : "border-zinc-800";

  return (
    <div className={`rounded-xl border overflow-hidden ${outerClass}`}>

      {/* ── Navigation header ─────────────────────────────────────── */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${dividerClass}`}>

        {/* ← */}
        <button
          onClick={() => setOffset((o) => o - 1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          className={`rounded px-1.5 py-0.5 text-sm leading-none transition-colors select-none ${
            canGoBack
              ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              : "text-zinc-700 cursor-not-allowed"
          }`}
        >
          ←
        </button>

        {/* Title */}
        <span className="flex-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Invoice Cycle · {displayLabel}
        </span>

        {/* Status pill — current month */}
        {hasDrafts && (
          <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400">
            {draftInvoices.length} draft{draftInvoices.length !== 1 ? "s" : ""} ready
          </span>
        )}
        {allBilled && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            ✓ all billed
          </span>
        )}

        {/* Status pill — historical month */}
        {historicalSummary && histHasSent && !histHasUnbilled && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            ✓ invoiced
          </span>
        )}
        {historicalSummary && histHasSent && histHasUnbilled && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
            ⚠ partial
          </span>
        )}
        {historicalSummary && !histHasSent && histHasUnbilled && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
            ⚠ not sent
          </span>
        )}
        {historicalSummary && !histHasSent && !histHasUnbilled && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-500">
            no activity
          </span>
        )}

        {/* → */}
        <button
          onClick={() => setOffset((o) => o + 1)}
          disabled={!canGoForward}
          aria-label="Next month"
          className={`rounded px-1.5 py-0.5 text-sm leading-none transition-colors select-none ${
            canGoForward
              ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              : "text-zinc-700 cursor-not-allowed"
          }`}
        >
          →
        </button>
      </div>

      {/* ── Current month body ─────────────────────────────────────── */}
      {offset === 0 && (
        <CurrentMonthBody
          draftInvoices={draftInvoices}
          unbilledClients={unbilledClients}
          daysUntilMonthEnd={daysUntilMonthEnd}
          monthEndLabel={monthEndLabel}
          monthStart={monthStart}
          monthEnd={monthEnd}
        />
      )}

      {/* ── Historical month body ──────────────────────────────────── */}
      {offset < 0 && historicalSummary && (
        <HistoricalBody summary={historicalSummary} />
      )}
    </div>
  );
}

// ─── Current month body ───────────────────────────────────────────────────────────

function CurrentMonthBody({
  draftInvoices,
  unbilledClients,
  daysUntilMonthEnd,
  monthEndLabel,
  monthStart,
  monthEnd,
}: {
  draftInvoices: DraftInvoice[];
  unbilledClients: UnbilledClient[];
  daysUntilMonthEnd: number;
  monthEndLabel: string;
  monthStart: string;
  monthEnd: string;
}) {
  const [pending, startTransition] = useTransition();

  const hasDrafts   = draftInvoices.length > 0;
  const hasUnbilled = unbilledClients.length > 0;

  // ── All billed ───────────────────────────────────────────────────────────────
  if (!hasDrafts && !hasUnbilled) {
    return (
      <div className="px-5 py-4 flex items-center justify-between">
        <p className="text-sm text-emerald-400 font-medium">✓ All billed this month</p>
        <Link href="/invoices" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          View invoices →
        </Link>
      </div>
    );
  }

  // ── Drafts ready ─────────────────────────────────────────────────────────────
  if (hasDrafts) {
    const totalAmount = draftInvoices.reduce((s, i) => s + i.total_amount, 0);
    return (
      <>
        <div className="px-5 py-3 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-500">Ready to send</span>
            <span className="text-sm font-semibold text-zinc-100 tabular-nums">
              {formatCurrency(totalAmount)} total
            </span>
          </div>
          {draftInvoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <Link
                  href={`/invoices/${inv.id}`}
                  className="font-mono text-zinc-300 hover:text-zinc-100 transition-colors"
                >
                  {inv.invoice_number}
                </Link>
                <span className="text-zinc-500">{inv.client_name}</span>
              </div>
              <span className="tabular-nums text-zinc-300">{formatCurrency(inv.total_amount)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-5 py-3 border-t border-blue-800/30">
          <button
            onClick={() =>
              startTransition(async () => {
                await sendAllDraftInvoices();
              })
            }
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {pending ? "Sending…" : `Send All${draftInvoices.length > 1 ? ` (${draftInvoices.length})` : ""}`}
          </button>
          <Link
            href="/invoices?status=draft"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Review first →
          </Link>
          <span className="ml-auto text-xs text-zinc-600">
            Marks as sent · email in Phase 3
          </span>
        </div>
      </>
    );
  }

  // ── Unbilled time, countdown ──────────────────────────────────────────────────
  const countdownText =
    daysUntilMonthEnd === 0
      ? "Auto-invoicing runs tonight"
      : daysUntilMonthEnd === 1
      ? `Auto-invoicing tomorrow (${monthEndLabel})`
      : `Auto-invoicing in ${daysUntilMonthEnd} days (${monthEndLabel})`;

  return (
    <>
      <div className="px-5 py-3 space-y-1.5">
        {unbilledClients.map((c) => (
          <div key={c.client_id} className="flex items-center justify-between text-sm">
            <span className="text-zinc-300">{c.client_name}</span>
            <div className="flex items-center gap-4">
              <span className="text-zinc-500">{c.hours.toFixed(1)} hrs</span>
              <span className="tabular-nums text-zinc-400">{formatCurrency(c.amount)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
        <p className="text-xs text-zinc-600">{countdownText}</p>
        <Link
          href={`/invoices/new?from=${monthStart}&to=${monthEnd}`}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Create now →
        </Link>
      </div>
    </>
  );
}

// ─── Historical month body ────────────────────────────────────────────────────────

function HistoricalBody({ summary }: { summary: MonthSummary }) {
  const { invoices, unbilledClients } = summary;
  const histFrom = `${summary.year}-${String(summary.month + 1).padStart(2, "0")}-01`;
  const histTo   = new Date(summary.year, summary.month + 1, 0).toISOString().split("T")[0];
  const hasSent     = invoices.length > 0;
  const hasUnbilled = unbilledClients.length > 0;

  // ── No activity ──────────────────────────────────────────────────────────────
  if (!hasSent && !hasUnbilled) {
    return (
      <div className="px-5 py-5">
        <p className="text-sm text-zinc-600">No billable activity this month.</p>
      </div>
    );
  }

  // ── Not invoiced — has unbilled time ─────────────────────────────────────────
  if (!hasSent && hasUnbilled) {
    const total = unbilledClients.reduce((s, c) => s + c.amount, 0);
    return (
      <>
        <div className="px-5 py-4">
          <p className="text-xs text-red-400 font-medium mb-3">
            No invoice was sent · {formatCurrency(total)} still unbilled
          </p>
          <div className="space-y-1.5">
            {unbilledClients.map((c) => (
              <div key={c.client_id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{c.client_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-zinc-600">{c.hours.toFixed(1)} hrs</span>
                  <span className="tabular-nums text-zinc-500">{formatCurrency(c.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-4">
          <Link
            href={`/invoices/new?from=${histFrom}&to=${histTo}`}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Create invoice →
          </Link>
          <Link
            href="/time"
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            View time entries →
          </Link>
        </div>
      </>
    );
  }

  // ── Invoiced (fully or partially) ────────────────────────────────────────────
  const totalBilled   = invoices.reduce((s, i) => s + i.total_amount, 0);
  const unbilledTotal = unbilledClients.reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <div className="px-5 py-3 space-y-2">
        {hasUnbilled && (
          <p className="text-xs text-amber-500 font-medium mb-1">
            ⚠ {formatCurrency(unbilledTotal)} still unbilled from this month
          </p>
        )}
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <Link
                href={`/invoices/${inv.id}`}
                className="font-mono text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                {inv.invoice_number}
              </Link>
              <span className="text-zinc-500">{inv.client_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  STATUS_BADGE[inv.status] ?? "bg-zinc-800 text-zinc-400"
                }`}
              >
                {inv.status}
              </span>
              <span className="tabular-nums text-zinc-300">{formatCurrency(inv.total_amount)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
        {hasUnbilled ? (
          <Link
            href={`/invoices/new?from=${histFrom}&to=${histTo}`}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Create invoice →
          </Link>
        ) : (
          <span className="text-xs text-emerald-500 font-medium">✓ Fully invoiced</span>
        )}
        <span className="text-xs text-zinc-500 tabular-nums">
          {formatCurrency(totalBilled)} billed
        </span>
      </div>
    </>
  );
}
