import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IncomeDashboard } from "@/components/income/IncomeDashboard";
import type { IncomeSummary, Opportunity, Asset, WinRateBySource } from "@/lib/income/types";

export const metadata = { title: "Bounty Engine" };

// Always fetch fresh — agent updates DB directly without invalidating Next.js cache
export const dynamic = "force-dynamic";

export default async function IncomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const db = supabase as any;
  const WEEKLY_TARGET = 600;

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thirtyAgo  = new Date(now); thirtyAgo.setDate(now.getDate() - 30);

  const [
    { data: earnings },
    { data: opportunities },
    { data: workQueue },
    { data: approvals },
    { data: activity },
    { data: assets },
    { data: pipelineItems },
    { data: outcomeOpps },
    { count: totalScanned },
    { data: lastDiscoveryRow },
  ] = await Promise.all([
    db.from("income_earnings").select("*").eq("user_id", user.id)
      .order("earned_date", { ascending: false }).limit(200),
    db.from("income_opportunities").select("*").eq("user_id", user.id)
      .not("status", "in", '("dismissed","paid","rejected")')
      .order("score", { ascending: false }).limit(100),
    db.from("income_work_queue").select("*").eq("user_id", user.id)
      .order("priority").limit(30),
    db.from("income_approvals").select("*").eq("user_id", user.id)
      .eq("status", "pending").order("priority").limit(20),
    db.from("income_activity_log").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(50),
    db.from("income_assets").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(50),
    db.from("income_work_queue").select("*, income_opportunities(score, source)").eq("user_id", user.id)
      .not("status", "in", '("done","failed","cancelled")')
      .order("priority").order("created_at", { ascending: false }).limit(50),
    // Historical outcomes for win rate by source
    db.from("income_opportunities").select("source, status").eq("user_id", user.id)
      .in("status", ["submitted", "accepted", "paid", "rejected", "done"]),
    // Total bounties ever scanned (all statuses)
    db.from("income_opportunities").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    // Dedicated last-scan query — not mixed with activity feed, never pushed out by pipeline volume
    db.from("income_activity_log").select("created_at").eq("user_id", user.id)
      .eq("action", "discovery_run").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const earningsList  = earnings ?? [];
  const collected     = earningsList.filter((e: any) => e.status === "collected");
  const pendingList   = earningsList.filter((e: any) => e.status === "pending");
  const sumUsd        = (arr: any[]) => arr.reduce((s: number, e: any) => s + (Number(e.amount_usd) || 0), 0);

  const thisWeek      = collected.filter((e: any) => new Date(e.earned_date) >= weekStart);
  const thisMonth     = collected.filter((e: any) => e.earned_date >= monthStart);
  const last30        = collected.filter((e: any) => new Date(e.earned_date) >= thirtyAgo);

  const collectedWeek = sumUsd(thisWeek);
  const pendingTotal  = sumUsd(pendingList);

  let daysSincePay: number | null = null;
  if (collected.length > 0) {
    daysSincePay = Math.floor((now.getTime() - new Date(collected[0].earned_date).getTime()) / 86_400_000);
  }

  const engines = ["bounty", "asset", "product", "content"] as const;
  const byEngine: Record<string, { collected: number; pending: number }> = {};
  for (const eng of engines) {
    byEngine[eng] = {
      collected: sumUsd(collected.filter((e: any) => e.engine === eng)),
      pending:   sumUsd(pendingList.filter((e: any) => e.engine === eng)),
    };
  }

  const allWork = workQueue ?? [];
  const totalHours = allWork.reduce((s: number, w: any) => s + (Number(w.hours_invested) || 0), 0);
  const collected30 = sumUsd(last30);
  const effectiveHourly = totalHours > 0 ? collected30 / totalHours : null;

  // Use dedicated query result — not vulnerable to activity feed volume
  const lastDiscovery = lastDiscoveryRow ?? (activity ?? []).find((a: any) => a.action === "discovery_run");

  // ── Win rate by source ─────────────────────────────────────────────────────
  const winRateBySource: Record<string, WinRateBySource> = {};
  for (const o of outcomeOpps ?? []) {
    const src = o.source as string;
    if (!winRateBySource[src]) winRateBySource[src] = { submitted: 0, won: 0, rate: 0 };
    winRateBySource[src].submitted++;
    if (["accepted", "paid", "done"].includes(o.status)) winRateBySource[src].won++;
  }
  for (const src of Object.keys(winRateBySource)) {
    const s = winRateBySource[src];
    s.rate = s.submitted > 0 ? s.won / s.submitted : 0;
  }

  // ── Queue projected earnings ───────────────────────────────────────────────
  const pendingQueueItems = (workQueue ?? []).filter((w: any) => w.status === "pending");
  const queueProjectedUsd = pendingQueueItems.reduce(
    (sum: number, w: any) => sum + (Number(w.expected_usd) || 0), 0
  );

  const summary: IncomeSummary = {
    collectedThisWeek:   collectedWeek,
    collectedThisMonth:  sumUsd(thisMonth),
    collectedLast30Days: collected30,
    pendingTotal,
    weeklyTarget:        WEEKLY_TARGET,
    weeklyProgress:      Math.min(1, collectedWeek / WEEKLY_TARGET),
    daysSinceLastPayment:daysSincePay,
    byEngine: byEngine as any,
    hoursInvested:       totalHours,
    effectiveHourly,
    activeOpportunities: (opportunities ?? []).length,
    pendingApprovals:    (approvals ?? []).length,
    lastDiscoveryRun:    lastDiscovery?.created_at ?? null,
    queueProjectedUsd,
    winRateBySource,
    totalBountyCount: totalScanned ?? 0,
    recentEarnings:      earningsList.slice(0, 20),
    topOpportunities:    (opportunities ?? []).slice(0, 50),
    workQueue:           allWork,
    approvals:           approvals ?? [],
    recentActivity:      activity ?? [],
  };

  return (
    <IncomeDashboard
      summary={summary}
      allEarnings={earningsList}
      allAssets={assets ?? []}
      userId={user.id}
      pipelineItems={pipelineItems ?? []}
    />
  );
}
