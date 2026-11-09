import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { InvoiceCycleWidget, type DraftInvoice, type UnbilledClient, type MonthSummary, type HistoricalInvoice } from "@/components/admin/invoice-cycle-widget";
import { QuickLinks } from "@/components/dashboard/QuickLinks";
import { DashboardThemeShell } from "@/components/dashboard/DashboardThemeShell";
import { PunchClock } from "@/components/dashboard/PunchClock";
import { ClientSnapshot, type ClientSnapshotRow } from "@/components/dashboard/ClientSnapshot";
import { TodaysFocus } from "@/components/dashboard/TodaysFocus";

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
  ] = await Promise.all([
    // Non-draft, non-void invoices — for AR totals + history
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

  // ── Client snapshot ────────────────────────────────────────────────────────
  const snapMap = new Map<string, ClientSnapshotRow>();
  for (const inv of invoices ?? []) {
    const clientName = (inv.clients as { company_name: string } | null)?.company_name ?? "Unknown";
    const existing = snapMap.get(inv.client_id) ?? { id: inv.client_id, name: clientName, balance: 0, uninvoicedHours: 0, lastInvoiceDaysAgo: null };
    if (inv.status !== "paid") existing.balance += inv.balance_due ?? 0;
    const daysAgo = Math.floor((Date.now() - new Date(inv.issue_date + "T12:00:00Z").getTime()) / 86400000);
    if (existing.lastInvoiceDaysAgo === null || daysAgo < existing.lastInvoiceDaysAgo) {
      existing.lastInvoiceDaysAgo = daysAgo;
    }
    snapMap.set(inv.client_id, existing);
  }
  for (const te of allUninvoicedTime ?? []) {
    const clientName = (te.clients as { company_name: string; default_hourly_rate: number | null } | null)?.company_name ?? "Unknown";
    const existing = snapMap.get(te.client_id) ?? { id: te.client_id, name: clientName, balance: 0, uninvoicedHours: 0, lastInvoiceDaysAgo: null };
    existing.uninvoicedHours += te.hours_decimal;
    snapMap.set(te.client_id, existing);
  }
  const clientSnapshotRows = Array.from(snapMap.values())
    .filter((c) => c.balance > 0 || c.uninvoicedHours > 0)
    .sort((a, b) => b.balance - a.balance);

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

      {/* Work Tracker + Client Snapshot */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <PunchClock userId={user!.id} />
        </div>
        <div className="col-span-1">
          <ClientSnapshot rows={clientSnapshotRows} />
        </div>
      </div>

      {/* Today's Focus + Quick Links */}
      <div className="grid grid-cols-2 gap-6 items-start">
        <TodaysFocus />
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

