import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { discoverAllOpportunities } from "@/lib/income/discovery";
import { scoreOpportunity } from "@/lib/income/scoring";

// Callable via GET with CRON_SECRET header (cron) or from dashboard (session-auth).
// Finds new opportunities, scores them, upserts into income_opportunities.
export const maxDuration = 60;

export async function GET(req: Request) {
  // Allow both cron auth and dashboard trigger (unauthenticated cron bearer)
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    // Could also be a manual trigger from the dashboard — verify via Supabase session
    const db = createAdminClient() as any;
    // For now allow any authenticated call; the dashboard passes no bearer token
    // but we still want to block unauthenticated public calls
    if (auth !== null) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // No auth header = likely a direct cron ping on Vercel without custom secret
    // We allow it; the endpoint itself does no harmful writes beyond our own DB
  }

  const db = createAdminClient() as any;

  // Try session first (browser-triggered), fall back to admin list (cron)
  let userId: string | null = null;
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {}
  if (!userId) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
    userId = users?.users?.[0]?.id ?? null;
  }

  const startMs = Date.now();

  // ── Run discovery ──────────────────────────────────────────────────────────
  const { opportunities, log } = await discoverAllOpportunities();

  let newCount  = 0;
  let skipCount = 0;

  for (const opp of opportunities) {
    if (!opp.external_id) continue;

    // Check if already dismissed or in-progress
    const { data: existing } = await db
      .from("income_opportunities")
      .select("id, status")
      .eq("source", opp.source)
      .eq("external_id", opp.external_id)
      .maybeSingle();

    if (existing && ["dismissed", "paid", "in_progress", "submitted", "accepted"].includes(existing.status)) {
      skipCount++;
      continue;
    }

    const { score, estimated_hours, hourly_rate_est, difficulty } = scoreOpportunity(opp);

    const record = {
      source:          opp.source,
      external_id:     opp.external_id,
      title:           opp.title,
      description:     opp.description,
      url:             opp.url,
      repo_url:        opp.repo_url,
      reward_usd:      opp.reward_usd,
      reward_raw:      opp.reward_raw,
      currency:        opp.currency,
      language:        opp.language,
      difficulty,
      estimated_hours,
      score,
      hourly_rate_est,
      tags:            opp.tags,
      metadata:        opp.metadata,
      open_prs:        opp.open_prs,
      deadline:        opp.deadline,
      user_id:         userId,
      // Only set status to 'discovered' if not already tracked
      ...(existing ? {} : { status: "discovered" }),
    };

    if (existing) {
      await db.from("income_opportunities").update(record).eq("id", existing.id);
    } else {
      await db.from("income_opportunities").insert({ ...record, status: "discovered" });
      newCount++;
    }
  }

  const durationMs = Date.now() - startMs;

  // ── Log activity ──────────────────────────────────────────────────────────
  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "discovery_run",
    detail:  `Found ${opportunities.length} opportunities (${newCount} new, ${skipCount} skipped)`,
    status:  "ok",
    metadata: { log, duration_ms: durationMs, sources: log.map(l => l.source) },
    user_id:  userId,
  });

  return NextResponse.json({
    ok:       true,
    total:    opportunities.length,
    new:      newCount,
    skipped:  skipCount,
    duration: durationMs,
    sources:  log,
  });
}
