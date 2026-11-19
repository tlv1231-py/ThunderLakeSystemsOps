import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { IncomeSummary } from "@/lib/income/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabase as any;
  const WEEKLY_TARGET = 600;

  // ── Date helpers ──────────────────────────────────────────────────────────
  const now     = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const monthAgo= new Date(now); monthAgo.setDate(now.getDate() - 30);
  // Week starts Monday
  const dow = (now.getDay() + 6) % 7; // 0=Mon
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);

  const [
    { data: earnings },
    { data: opportunities },
    { data: workQueue },
    { data: approvals },
    { data: activity },
    { data: assets },
  ] = await Promise.all([
    db.from("income_earnings")
      .select("*")
      .eq("user_id", user.id)
      .order("earned_date", { ascending: false })
      .limit(200),

    db.from("income_opportunities")
      .select("*")
      .eq("user_id", user.id)
      .not("status", "in", '("dismissed","paid","rejected")')
      .order("score", { ascending: false })
      .limit(50),

    db.from("income_work_queue")
      .select("*")
      .eq("user_id", user.id)
      .not("status", "in", '("done","failed","cancelled")')
      .order("priority", { ascending: true })
      .limit(20),

    db.from("income_approvals")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .limit(20),

    db.from("income_activity_log")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),

    db.from("income_assets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const earningsList = earnings ?? [];

  // ── Aggregations ──────────────────────────────────────────────────────────
  const collected     = earningsList.filter((e: any) => e.status === "collected");
  const pending       = earningsList.filter((e: any) => e.status === "pending");

  const thisWeek      = collected.filter((e: any) => new Date(e.earned_date) >= weekStart);
  const last30        = collected.filter((e: any) => new Date(e.earned_date) >= monthAgo);

  const sumUsd = (arr: any[]) =>
    arr.reduce((s: number, e: any) => s + (Number(e.amount_usd) || 0), 0);

  const collectedWeek  = sumUsd(thisWeek);
  const collectedMonth = sumUsd(collected.filter((e: any) => new Date(e.earned_date) >= new Date(now.getFullYear(), now.getMonth(), 1)));
  const collected30    = sumUsd(last30);
  const pendingTotal   = sumUsd(pending);

  // Days since last payment
  let daysSincePay: number | null = null;
  if (collected.length > 0) {
    const latest = new Date(collected[0].earned_date);
    daysSincePay = Math.floor((now.getTime() - latest.getTime()) / 86_400_000);
  }

  // By engine
  const engines = ["bounty", "asset", "product", "content"] as const;
  const byEngine: Record<string, { collected: number; pending: number }> = {};
  for (const eng of engines) {
    byEngine[eng] = {
      collected: sumUsd(collected.filter((e: any) => e.engine === eng)),
      pending:   sumUsd(pending.filter((e: any) => e.engine === eng)),
    };
  }

  // Hours invested + effective hourly
  const totalHours = (workQueue ?? []).concat(
    await db.from("income_work_queue").select("hours_invested").eq("user_id", user.id)
      .not("status", "in", '("pending")').then((r: any) => r.data ?? [])
  ).reduce((s: number, w: any) => s + (Number(w.hours_invested) || 0), 0);

  const effectiveHourly = totalHours > 0 ? collected30 / totalHours : null;

  // Last discovery run
  const lastDiscovery = (activity ?? []).find((a: any) => a.action === "discovery_run");

  const summary: IncomeSummary = {
    collectedThisWeek:  collectedWeek,
    collectedThisMonth: collectedMonth,
    collectedLast30Days: collected30,
    pendingTotal,
    weeklyTarget:   WEEKLY_TARGET,
    weeklyProgress: Math.min(1, collectedWeek / WEEKLY_TARGET),
    daysSinceLastPayment: daysSincePay,
    byEngine: byEngine as any,
    hoursInvested: totalHours,
    effectiveHourly,
    activeOpportunities: (opportunities ?? []).length,
    pendingApprovals:    (approvals ?? []).length,
    lastDiscoveryRun:    lastDiscovery?.created_at ?? null,
    recentEarnings:      earningsList.slice(0, 10),
    topOpportunities:    (opportunities ?? []).slice(0, 10),
    workQueue:           workQueue ?? [],
    approvals:           approvals ?? [],
    recentActivity:      activity ?? [],
  };

  return NextResponse.json(summary);
}
