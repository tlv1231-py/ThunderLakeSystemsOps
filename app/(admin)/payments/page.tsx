import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: payments } = await supabase
    .from("payments")
    .select("*, invoices!inner(invoice_number, user_id), clients(company_name)")
    .eq("invoices.user_id", user!.id)
    .order("payment_date", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Payments</h1>
        <p className="mt-1 text-sm text-zinc-500">Payment history</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {!payments?.length ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-400">
            No payments recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Client</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Invoice</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Method</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-zinc-600 tabular-nums">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {(p.clients as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-700">
                    {(p.invoices as { invoice_number: string }).invoice_number}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 uppercase text-xs font-medium">
                    {p.payment_method}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900">
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
