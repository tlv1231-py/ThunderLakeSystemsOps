import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { INVOICE_STATUSES } from "@/lib/constants";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, clients(company_name)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {invoices?.length ?? 0} invoice{invoices?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/invoices/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
        >
          New invoice
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {!invoices?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No invoices yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Invoice #</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Issue Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Due Date</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Total</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Balance</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invoices.map((inv) => {
                const statusMeta = INVOICE_STATUSES.find((s) => s.value === inv.status);
                return (
                  <tr key={inv.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono font-medium text-zinc-900 hover:text-zinc-600"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {(inv.clients as { company_name: string } | null)?.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900">
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                      {formatCurrency(inv.balance_due, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${statusMeta?.color ?? "text-zinc-600"}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
