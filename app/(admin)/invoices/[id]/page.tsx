import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, projectColorIndex } from "@/lib/utils";
import { INVOICE_STATUSES } from "@/lib/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceActions } from "./invoice-actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: invoice },
    { data: timeEntries },
    { data: expenseEntries },
    { data: payments },
    { data: userSettings },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, clients(company_name, billing_address)")
      .eq("id", id)
      .eq("user_id", user!.id)
      .single(),

    supabase
      .from("time_entries")
      .select("id, date_worked, hours_decimal, description, projects(name), clients(default_hourly_rate)")
      .eq("invoice_id", id)
      .order("date_worked"),

    supabase
      .from("expense_entries")
      .select("id, date_incurred, description, amount")
      .eq("invoice_id", id)
      .order("date_incurred"),

    supabase
      .from("payments")
      .select("id, amount, payment_date, payment_method, reference_number")
      .eq("invoice_id", id)
      .order("payment_date"),

    supabase
      .from("users")
      .select("company_name, billing_address")
      .eq("id", user!.id)
      .single(),
  ]);

  if (!invoice) notFound();

  const statusMeta = INVOICE_STATUSES.find((s) => s.value === invoice.status);
  const client = invoice.clients as { company_name: string; billing_address: string | null } | null;

  const projectBadgeClasses = [
    "bg-blue-900/40 text-blue-300",
    "bg-emerald-900/40 text-emerald-300",
    "bg-amber-900/40 text-amber-300",
    "bg-violet-900/40 text-violet-300",
    "bg-rose-900/40 text-rose-300",
    "bg-cyan-900/40 text-cyan-300",
    "bg-orange-900/40 text-orange-300",
    "bg-teal-900/40 text-teal-300",
  ];

  const statusColors: Record<string, string> = {
    draft:   "bg-zinc-800 text-zinc-400",
    sent:    "bg-blue-900/40 text-blue-400",
    viewed:  "bg-indigo-900/40 text-indigo-400",
    partial: "bg-amber-900/40 text-amber-400",
    paid:    "bg-emerald-900/40 text-emerald-400",
    overdue: "bg-red-900/40 text-red-400",
    void:    "bg-zinc-800 text-zinc-500",
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-100 font-mono">
              {invoice.invoice_number}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[invoice.status] ?? "bg-zinc-800 text-zinc-400"}`}>
              {invoice.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {client?.company_name} · Issued {formatDate(invoice.issue_date)} · Due {formatDate(invoice.due_date)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/invoices/${id}/pdf`}
            target="_blank"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            Download PDF
          </Link>
          <InvoiceActions
            invoiceId={id}
            status={invoice.status}
            invoice={{
              id: invoice.id,
              invoice_number: invoice.invoice_number,
              balance_due: invoice.balance_due,
              currency: invoice.currency,
              clients: client ? { company_name: client.company_name } : null,
            }}
          />
        </div>
      </div>

      {/* Invoice meta grid */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">From</h3>
          <div className="text-sm text-zinc-300 space-y-0.5">
            <p className="font-medium text-zinc-100">{userSettings?.company_name ?? "Thunder Lake Systems"}</p>
            {userSettings?.billing_address && <p className="text-zinc-400">{userSettings.billing_address}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bill To</h3>
          <div className="text-sm text-zinc-300 space-y-0.5">
            <p className="font-medium text-zinc-100">{client?.company_name ?? "—"}</p>
            {client?.billing_address && <p className="text-zinc-400">{client.billing_address}</p>}
          </div>
        </div>
      </div>

      {/* Time entries */}
      {(timeEntries?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-100">Time</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/40">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Project</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Hrs</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Rate</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {timeEntries!.map((e) => {
                const rate =
                  (e.projects as { name: string } | null)
                    ? null // fetched separately below
                    : (e.clients as { default_hourly_rate: number | null } | null)?.default_hourly_rate ?? 0;
                // Derive from total: line amount ≈ hours × rate (we don't store per-line rate)
                // Use client rate as proxy
                const clientRate = (e.clients as { default_hourly_rate: number | null } | null)?.default_hourly_rate ?? 0;
                const amount = e.hours_decimal * clientRate;
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{formatDate(e.date_worked)}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const name = (e.projects as { name: string } | null)?.name;
                        if (!name) return <span className="text-zinc-600">—</span>;
                        const cls = projectBadgeClasses[projectColorIndex(name)];
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
                            {name}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">{e.description ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-100">{e.hours_decimal.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                      {clientRate > 0 ? formatCurrency(clientRate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">
                      {clientRate > 0 ? formatCurrency(amount) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expense entries */}
      {(expenseEntries?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-100">Expenses</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/40">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {expenseEntries!.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{formatDate(e.date_incurred)}</td>
                  <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">{e.description ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-100">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-2 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.tax_amount > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Tax</span>
              <span className="tabular-nums">{formatCurrency(invoice.tax_amount)}</span>
            </div>
          )}
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between text-zinc-400">
              <span>Discount</span>
              <span className="tabular-nums text-emerald-400">−{formatCurrency(invoice.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-zinc-100 pt-2 border-t border-zinc-800">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
          </div>
          {invoice.amount_paid > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Paid</span>
              <span className="tabular-nums">−{formatCurrency(invoice.amount_paid)}</span>
            </div>
          )}
          {invoice.balance_due > 0 && (
            <div className="flex justify-between font-semibold text-zinc-100">
              <span>Balance due</span>
              <span className="tabular-nums">{formatCurrency(invoice.balance_due)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Notes</h3>
          <p className="text-sm text-zinc-400 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Payments received */}
      {(payments?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-100">Payments Received</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/40">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Method</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Reference</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {payments!.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 text-zinc-400 uppercase text-xs font-medium">{p.payment_method}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{p.reference_number ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-400">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Back link */}
      <div>
        <Link href="/invoices" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          ← All invoices
        </Link>
      </div>
    </div>
  );
}
