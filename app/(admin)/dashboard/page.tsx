import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { ActivityCalendar } from "@/components/admin/activity-calendar";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];

  const [
    { data: invoices },
    { data: uninvoicedTime },
    { data: monthlyTime },
    { data: monthlyExpenses },
    { data: calendarTime },
    { data: calendarEvents },
    { data: recentActivity },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, balance_due, due_date, currency")
      .eq("user_id", user!.id)
      .neq("status", "void")
      .neq("status", "draft"),
    // All uninvoiced billable hours (for KPI)
    supabase
      .from("time_entries")
      .select("hours_decimal")
      .eq("user_id", user!.id)
      .eq("status", "uninvoiced")
      .eq("billable", true),
    // This month's uninvoiced billable time × rate
    supabase
      .from("time_entries")
      .select("hours_decimal, clients(default_hourly_rate), projects(hourly_rate_override)")
      .eq("user_id", user!.id)
      .eq("billable", true)
      .eq("status", "uninvoiced")
      .gte("date_worked", monthStart)
      .lte("date_worked", monthEnd),
    // This month's uninvoiced billable expenses
    supabase
      .from("expense_entries")
      .select("amount")
      .eq("user_id", user!.id)
      .eq("billable", true)
      .eq("status", "uninvoiced")
      .gte("date_incurred", monthStart)
      .lte("date_incurred", monthEnd),
    // Calendar: billable time entries last 3 months
    supabase
      .from("time_entries")
      .select("date_worked, hours_decimal")
      .eq("user_id", user!.id)
      .eq("billable", true)
      .gte("date_worked", threeMonthsAgo),
    // Calendar: activity events last 3 months
    supabase
      .from("activity_events")
      .select("created_at, event_type")
      .eq("user_id", user!.id)
      .gte("created_at", threeMonthsAgo + "T00:00:00Z"),
    // Recent activity feed
    supabase
      .from("activity_events")
      .select("id, event_type, event_data, created_at, clients(company_name)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const today = now.toISOString().split("T")[0];

  const outstanding = (invoices ?? []).reduce(
    (sum, inv) => inv.status !== "paid" ? sum + (inv.balance_due ?? 0) : sum,
    0
  );

  const overdue = (invoices ?? [])
    .filter((inv) => inv.status !== "paid" && inv.due_date < today)
    .reduce((sum, inv) => sum + (inv.balance_due ?? 0), 0);

  // AR aging buckets
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const inv of invoices ?? []) {
    if (inv.status === "paid") continue;
    const daysOverdue = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
    if (daysOverdue <= 0) buckets.current += inv.balance_due ?? 0;
    else if (daysOverdue <= 30) buckets.d1_30 += inv.balance_due ?? 0;
    else if (daysOverdue <= 60) buckets.d31_60 += inv.balance_due ?? 0;
    else if (daysOverdue <= 90) buckets.d61_90 += inv.balance_due ?? 0;
    else buckets.d90plus += inv.balance_due ?? 0;
  }

  const uninvoicedHours = (uninvoicedTime ?? []).reduce((sum, e) => sum + e.hours_decimal, 0);

  // This month's projected income
  const monthlyTimeIncome = (monthlyTime ?? []).reduce((sum, e) => {
    const rate =
      (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
      (e.clients as { default_hourly_rate: number | null } | null)?.default_hourly_rate ??
      0;
    return sum + e.hours_decimal * rate;
  }, 0);
  const monthlyExpenseIncome = (monthlyExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const projectedIncome = monthlyTimeIncome + monthlyExpenseIncome;

  // Build calendar data structures
  const hoursByDate: Record<string, number> = {};
  for (const e of calendarTime ?? []) {
    hoursByDate[e.date_worked] = (hoursByDate[e.date_worked] ?? 0) + e.hours_decimal;
  }

  const eventsByDate: Record<string, string[]> = {};
  for (const e of calendarEvents ?? []) {
    const dateKey = e.created_at.split("T")[0];
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(formatEventLabel(e.event_type));
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Accounts receivable overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Outstanding" value={formatCurrency(outstanding)} />
        <StatCard label="Overdue" value={formatCurrency(overdue)} highlight={overdue > 0} />
        <StatCard
          label={`Projected · ${now.toLocaleDateString("en-US", { month: "short" })}`}
          value={formatCurrency(projectedIncome)}
        />
        <StatCard label="Uninvoiced Hours" value={`${uninvoicedHours.toFixed(1)} hrs`} />
      </div>

      {/* Calendar + AR Aging */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <ActivityCalendar hoursByDate={hoursByDate} eventsByDate={eventsByDate} />
        </div>

        <div className="col-span-1">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-100">AR Aging</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { label: "Current", value: buckets.current, red: false },
                { label: "1–30 days", value: buckets.d1_30, red: true },
                { label: "31–60 days", value: buckets.d31_60, red: true },
                { label: "61–90 days", value: buckets.d61_90, red: true },
                { label: "90+ days", value: buckets.d90plus, red: true },
              ].map(({ label, value, red }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-zinc-400">{label}</span>
                  <span className={`text-sm font-medium tabular-nums ${value > 0 && red ? "text-red-400" : "text-zinc-300"}`}>
                    {formatCurrency(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div>
        <h2 className="mb-4 text-sm font-medium text-zinc-400">Recent Activity</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
          {(recentActivity ?? []).length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-500 text-center">No activity yet</p>
          )}
          {(recentActivity ?? []).map((event) => (
            <div key={event.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300 truncate">
                  {formatEventLabel(event.event_type)}
                  {(event.clients as { company_name: string } | null)?.company_name
                    ? ` — ${(event.clients as { company_name: string }).company_name}`
                    : ""}
                </p>
              </div>
              <time className="text-xs text-zinc-500 flex-shrink-0">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${highlight ? "text-red-400" : "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

function formatEventLabel(type: string): string {
  return type
    .split(".")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
