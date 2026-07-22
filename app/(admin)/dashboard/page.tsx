import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { CashflowTimeline } from "@/components/dashboard/CashflowTimeline";
import { InvoiceCycleWidget, type DraftInvoice, type UnbilledClient, type MonthSummary, type HistoricalInvoice } from "@/components/admin/invoice-cycle-widget";
import {
  buildCashflowTimeline,
  type CashflowInvoice,
  type CashflowTimeEntry,
} from "@/services/cashflow-service";
import { QuickLinks } from "@/components/dashboard/QuickLinks";
import { DashboardThemeShell } from "@/components/dashboard/DashboardThemeShell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Vercel runs in UTC. Compute today's date in Eastern time so month
  // boundaries don't flip at 8 pm ET (= midnight UTC).
  const _etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD" in ET
  const now = new Date(_etDate + "T12:00:00Z"); // noon UTC on the ET calendar date
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString().split("T")[0];

  const db = supabase as any;
  const { data: dbPref } = await db
    .from("dashboard_preferences")
    .select("theme")
    .eq("user_id", user!.id)
    .maybeSingle();
  const initialTheme = (dbPref?.theme ?? "dark") as "dark" | "light";

  const [
    { data: invoices },
    { data: draftInvoices },
    { data: allUninvoicedTime },
    { data: monthlyExpenses },
    { data: recentActivity },
  ] = await Promise.all([
    // Non-draft, non-void invoices — for AR totals + cashflow + history
    supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total_amount, balance_due, currency, client_id, clients(company_name)")
      .eq("user_id", user!.id)
      .neq("status", "void")
      .neq("status", "draft"),

    // Draft invoices — for the invoice cycle widget
    supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, client_id, clients(company_name)")
      .eq("user_id", user!.id)
      .eq("status", "draft"),

    // All uninvoiced billable time — with client name for widget + rates for KPIs
    supabase
      .from("time_entries")
      .select(
        "date_worked, hours_decimal, client_id, clients(company_name, default_hourly_rate), projects(hourly_rate_override)"
      )
      .eq("user_id", user!.id)
      .eq("status", "uninvoiced")
      .eq("billable", true),

    // This month's uninvoiced billable expenses
    supabase
      .from("expense_entries")
      .select("amount")
      .eq("user_id", user!.id)
      .eq("billable", true)
      .eq("status", "uninvoiced")
      .gte("date_incurred", monthStart)
      .lte("date_incurred", monthEnd),

    // Recent activity feed
    supabase
      .from("activity_events")
      .select("id, event_type, event_data, created_at, clients(company_name)")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const today = now.toISOString().split("T")[0];

  // ── AR totals ───────────────────────────────────────────────────────────────
  const outstanding = (invoices ?? []).reduce(
    (sum, inv) => (inv.status !== "paid" ? sum + (inv.balance_due ?? 0) : sum),
    0
  );
  const overdue = (invoices ?? [])
    .filter((inv) => inv.status !== "paid" && inv.due_date < today)
    .reduce((sum, inv) => sum + (inv.balance_due ?? 0), 0);

  // ── AR aging ────────────────────────────────────────────────────────────────
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const inv of invoices ?? []) {
    if (inv.status === "paid") continue;
    const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
    if (days <= 0)       buckets.current += inv.balance_due ?? 0;
    else if (days <= 30) buckets.d1_30   += inv.balance_due ?? 0;
    else if (days <= 60) buckets.d31_60  += inv.balance_due ?? 0;
    else if (days <= 90) buckets.d61_90  += inv.balance_due ?? 0;
    else                 buckets.d90plus += inv.balance_due ?? 0;
  }

  // ── KPI: uninvoiced hours ───────────────────────────────────────────────────
  const uninvoicedHours = (allUninvoicedTime ?? []).reduce(
    (sum, e) => sum + e.hours_decimal, 0
  );

  // ── KPI: this month's projected income ─────────────────────────────────────
  const monthlyTimeIncome = (allUninvoicedTime ?? [])
    .filter((e) => e.date_worked >= monthStart && e.date_worked <= monthEnd)
    .reduce((sum, e) => {
      const rate =
        (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
        (e.clients  as { default_hourly_rate: number | null }  | null)?.default_hourly_rate ??
        0;
      return sum + e.hours_decimal * rate;
    }, 0);
  const monthlyExpenseIncome = (monthlyExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  const projectedIncome = monthlyTimeIncome + monthlyExpenseIncome;

  // ── Invoice Cycle widget data ───────────────────────────────────────────────
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysUntilMonthEnd = lastDayOfMonth.getDate() - now.getDate();
  const monthEndLabel = lastDayOfMonth.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const monthLabel    = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const typedDrafts: DraftInvoice[] = (draftInvoices ?? []).map((inv) => ({
    id:             inv.id,
    invoice_number: inv.invoice_number,
    total_amount:   inv.total_amount,
    client_name:    (inv.clients as { company_name: string } | null)?.company_name ?? "—",
  }));

  // Aggregate unbilled time by client (all time, not just this month)
  const unbilledMap = new Map<string, UnbilledClient>();
  for (const e of allUninvoicedTime ?? []) {
    const clientName = (e.clients as { company_name: string; default_hourly_rate: number | null } | null)?.company_name ?? "Unknown";
    const rate =
      (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
      (e.clients  as { default_hourly_rate: number | null }  | null)?.default_hourly_rate ??
      0;
    const existing = unbilledMap.get(e.client_id) ?? {
      client_id: e.client_id,
      client_name: clientName,
      hours: 0,
      amount: 0,
    };
    existing.hours  += e.hours_decimal;
    existing.amount += e.hours_decimal * rate;
    unbilledMap.set(e.client_id, existing);
  }
  const unbilledClients = Array.from(unbilledMap.values());

  // ── Month history (last 12 months) ─────────────────────────────────────────
  // Derived from already-loaded data — no extra queries needed.
  const monthHistory: MonthSummary[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth();
    const ms    = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const me    = new Date(year, month + 1, 0).toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Non-draft, non-void invoices issued in this month
    const histInvoices: HistoricalInvoice[] = (invoices ?? [])
      .filter((inv) => inv.issue_date >= ms && inv.issue_date <= me)
      .map((inv) => ({
        id:             inv.id,
        invoice_number: inv.invoice_number,
        status:         inv.status,
        total_amount:   inv.total_amount,
        balance_due:    inv.balance_due ?? 0,
        client_name:    (inv.clients as { company_name: string } | null)?.company_name ?? "—",
      }));

    // Still-uninvoiced billable time from this month, aggregated by client
    const monthTimeMap = new Map<string, UnbilledClient>();
    for (const e of (allUninvoicedTime ?? []).filter(
      (e) => e.date_worked >= ms && e.date_worked <= me
    )) {
      const clientName =
        (e.clients as { company_name: string; default_hourly_rate: number | null } | null)
          ?.company_name ?? "Unknown";
      const rate =
        (e.projects as { hourly_rate_override: number | null } | null)?.hourly_rate_override ??
        (e.clients  as { default_hourly_rate: number | null }  | null)?.default_hourly_rate ??
        0;
      const existing = monthTimeMap.get(e.client_id) ?? {
        client_id: e.client_id, client_name: clientName, hours: 0, amount: 0,
      };
      existing.hours  += e.hours_decimal;
      existing.amount += e.hours_decimal * rate;
      monthTimeMap.set(e.client_id, existing);
    }

    monthHistory.push({
      year, month, label,
      invoices:       histInvoices,
      unbilledClients: Array.from(monthTimeMap.values()),
    });
  }

  // ── Cashflow timeline ───────────────────────────────────────────────────────
  // Include drafts in cashflow so they show as projected-ish (we use all invoices)
  const allInvoicesForCashflow = [
    ...(invoices ?? []),
    ...(draftInvoices ?? []).map((d) => ({
      ...d,
      status: "draft", // will be filtered out by buildCashflowTimeline (only shows sent/paid/overdue)
      due_date: today,
    })),
  ];

  const cashflowWeeks = buildCashflowTimeline(
    allInvoicesForCashflow as unknown as CashflowInvoice[],
    (allUninvoicedTime ?? []) as CashflowTimeEntry[]
  );

  return (
    <DashboardThemeShell initialTheme={initialTheme} userId={user!.id}>
    <div className="space-y-6">
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
          green
        />
        <StatCard
          label="Uninvoiced Hours"
          value={`${uninvoicedHours.toFixed(1)} hrs`}
        />
      </div>

      {/* Invoice Cycle widget */}
      <InvoiceCycleWidget
        draftInvoices={typedDrafts}
        unbilledClients={unbilledClients}
        daysUntilMonthEnd={daysUntilMonthEnd}
        monthEndLabel={monthEndLabel}
        monthLabel={monthLabel}
        monthStart={monthStart}
        monthEnd={monthEnd}
        monthHistory={monthHistory}
      />

      {/* Cashflow Timeline + AR Aging */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <CashflowTimeline weeks={cashflowWeeks} />
        </div>

        <div className="col-span-1">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-100">AR Aging</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { label: "Current",    value: buckets.current, red: false },
                { label: "1–30 days",  value: buckets.d1_30,   red: true  },
                { label: "31–60 days", value: buckets.d31_60,  red: true  },
                { label: "61–90 days", value: buckets.d61_90,  red: true  },
                { label: "90+ days",   value: buckets.d90plus, red: true  },
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

      {/* Activity feed + Quick Links */}
      <div className="grid grid-cols-2 gap-6 items-start">
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
        <QuickLinks userId={user!.id} />
      </div>
    </div>
    </DashboardThemeShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, highlight = false, green = false,
}: {
  label: string; value: string; highlight?: boolean; green?: boolean;
}) {
  const valueColor = highlight ? "text-red-400" : green ? "text-emerald-400" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function formatEventLabel(type: string): string {
  return type.split(".").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
