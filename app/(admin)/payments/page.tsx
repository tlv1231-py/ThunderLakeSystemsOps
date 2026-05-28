import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RecordPaymentModal } from "@/components/admin/record-payment-modal";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: payments }, { data: openInvoices }] = await Promise.all([
    supabase
      .from("payments")
      .select("*, invoices!inner(invoice_number, user_id), clients(company_name)")
      .eq("invoices.user_id", user!.id)
      .order("payment_date", { ascending: false }),

    supabase
      .from("invoices")
      .select("id, invoice_number, balance_due, currency, clients(company_name)")
      .eq("user_id", user!.id)
      .in("status", ["sent", "viewed", "partial", "overdue"])
      .gt("balance_due", 0)
      .order("due_date"),
  ]);

  const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Payments</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatCurrency(totalPaid)} received · {payments?.length ?? 0} payment{payments?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <RecordPaymentModal invoices={openInvoices ?? []} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {!payments?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            No payments recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Invoice</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Method</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Reference</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-800/40">
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {(p.clients as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {(p.invoices as { invoice_number: string }).invoice_number}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 uppercase text-xs font-medium">
                    {p.payment_method}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {p.reference_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-100">
                    {formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
