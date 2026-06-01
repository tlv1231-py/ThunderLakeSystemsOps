export interface WeekBucket {
  weekStart: string; // ISO date — first day of the month
  weekLabel: string; // "Apr '25"
  projected: number;
  sent: number;
  paid: number;
  overdue: number;
}

export interface CashflowInvoice {
  status: string;
  issue_date: string;
  total_amount: number;
}

export interface CashflowTimeEntry {
  date_worked: string;
  hours_decimal: number;
  projects: { hourly_rate_override: number | null } | null;
  clients: { default_hourly_rate: number | null } | null;
}

/** Returns the ISO date of the first day of the month containing dateStr. */
export function toWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function shiftMonths(monthStart: string, n: number): string {
  const d = new Date(monthStart + "T12:00:00");
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function shortLabel(monthStart: string): string {
  const d = new Date(monthStart + "T12:00:00");
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  const yr  = String(d.getFullYear()).slice(2);
  return `${mon} '${yr}`;
}

export function buildCashflowTimeline(
  invoices: CashflowInvoice[],
  timeEntries: CashflowTimeEntry[],
  pastMonths = 13,
  futureMonths = 3,
): WeekBucket[] {
  const todayStr = new Date().toISOString().split("T")[0];
  const currentMonth = toWeekStart(todayStr);

  const months: string[] = [];
  for (let i = -pastMonths; i <= futureMonths; i++) {
    months.push(shiftMonths(currentMonth, i));
  }

  const bucketMap = new Map<string, WeekBucket>();
  for (const m of months) {
    bucketMap.set(m, {
      weekStart: m,
      weekLabel: shortLabel(m),
      projected: 0,
      sent: 0,
      paid: 0,
      overdue: 0,
    });
  }

  // Aggregate invoices by issue_date → month bucket
  for (const inv of invoices) {
    const monthKey = toWeekStart(inv.issue_date);
    const b = bucketMap.get(monthKey);
    if (!b) continue;
    const amt = inv.total_amount ?? 0;
    if (inv.status === "paid") b.paid += amt;
    else if (inv.status === "overdue") b.overdue += amt;
    else if (inv.status === "sent" || inv.status === "viewed" || inv.status === "partial")
      b.sent += amt;
  }

  // Aggregate uninvoiced time entries by date_worked → month bucket (projected revenue)
  for (const e of timeEntries) {
    const monthKey = toWeekStart(e.date_worked);
    const b = bucketMap.get(monthKey);
    if (!b) continue;
    const rate =
      e.projects?.hourly_rate_override ??
      e.clients?.default_hourly_rate ??
      0;
    b.projected += e.hours_decimal * rate;
  }

  return months.map((m) => bucketMap.get(m)!);
}
