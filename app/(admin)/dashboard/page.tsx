import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parallel data fetches
  const [
    { data: invoices },
    { data: timeEntries },
    { data: expenseEntries },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, total_amount, amount_paid, balance_due, due_date, currency, clients(company_name)")
      .eq("user_id", user!.id)
      .neq("status", "void")
      .neq("status", "draft"),
    supabase
      .from("time_entries")
      .select("hours_decimal, billable, status, clients(company_name, default_hourly_rate), projects(hourly_rate_override)")
      .eq("user_id", user!.id)
      .eq("status", "uninvoiced")
      .eq("billable", true),
    supabase
      .from("expense_entries")
      .select("amount, currency, status")
      .eq("user_id", user!.id)
      .eq("status", "uninvoiced")
      .eq("billable", true),
    supabase
      .from("activity_events")
      .select("id, event_type, event_data, created_at, clients(company_name), invoices(invoice_number)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const today = new Date().toISOString().split("T")[0];

  const outstanding = (invoices ?? []).reduce(
    (sum, inv) =>
      inv.status !== "paid" ? sum + (inv.balance_due ?? 0) : sum,
    0
  );

  const overdue = (invoices ?? [])
    .filter((inv) => inv.status !== "paid" && inv.due_date < today)
    .reduce((sum, inv) => sum + (inv.balance_due ?? 0), 0);

  // Aging buckets
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const inv of invoices ?? []) {
    if (inv.status === "paid") continue;
    const daysOverdue = Math.floor(
      (Date.now() - new Date(inv.due_date).getTime()) / 86400000
    );
    if (daysOverdue <= 0) buckets.current += inv.balance_due ?? 0;
    else if (daysOverdue <= 30) buckets.d1_30 += inv.balance_due ?? 0;
    else if (daysOverdue <= 60) buckets.d31_60 += inv.balance_due ?? 0;
    else if (daysOverdue <= 90) buckets.d61_90 += inv.balance_due ?? 0;
    else buckets.d90plus += inv.balance_due ?? 0;
  }

  const uninvoicedHours = (timeEntries ?? []).reduce(
    (sum, e) => sum + e.hours_decimal,
    0
  );
  const uninvoicedExpenses = (expenseEntries ?? []).reduce(
    (sum, e) => sum + e.amount,
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Accounts receivable overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Outstanding" value={formatCurrency(outstanding)} />
        <StatCard label="Overdue" value={formatCurrency(overdue)} highlight={overdue > 0} />
        <StatCard label="Uninvoiced Hours" value={`${uninvoicedHours.toFixed(1)} hrs`} />
        <StatCard label="Uninvoiced Expenses" value={formatCurrency(uninvoicedExpenses)} />
      </div>

      {/* Aging buckets */}
      <div>
        <h2 className="mb-4 text-sm font-medium text-zinc-700">AR Aging</h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                {["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-600">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[
                  buckets.current,
                  buckets.d1_30,
                  buckets.d31_60,
                  buckets.d61_90,
                  buckets.d90plus,
                ].map((v, i) => (
                  <td
                    key={i}
                    className={`px-4 py-4 font-medium ${v > 0 && i > 0 ? "text-red-600" : "text-zinc-900"}`}
                  >
                    {formatCurrency(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity feed */}
      <div>
        <h2 className="mb-4 text-sm font-medium text-zinc-700">Recent Activity</h2>
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
          {(recentActivity ?? []).length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-400 text-center">
              No activity yet
            </p>
          )}
          {(recentActivity ?? []).map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-800 truncate">
                  {formatEventType(event.event_type)}
                  {(event.clients as { company_name: string } | null)?.company_name
                    ? ` — ${(event.clients as { company_name: string }).company_name}`
                    : ""}
                </p>
              </div>
              <time className="text-xs text-zinc-400 flex-shrink-0">
                {new Date(event.created_at).toLocaleDateString()}
              </time>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${highlight ? "text-red-600" : "text-zinc-900"}`}>
        {value}
      </p>
    </div>
  );
}

function formatEventType(type: string): string {
  return type
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
