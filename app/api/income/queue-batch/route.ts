import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/income/queue-batch
// Body: { ids: string[] }
// Queues multiple opportunities at once for the agent pipeline
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });

  const db = supabase as any;
  const queued: string[] = [];

  for (const id of ids) {
    const { data: opp } = await db
      .from("income_opportunities")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!opp) continue;
    if (["dismissed", "in_progress", "submitted", "accepted", "paid"].includes(opp.status)) continue;

    // Update opportunity status
    await db.from("income_opportunities")
      .update({ status: "queued" })
      .eq("id", id).eq("user_id", user.id);

    // Create or update work queue item
    const { data: existing } = await db
      .from("income_work_queue")
      .select("id")
      .eq("opportunity_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      await db.from("income_work_queue").insert({
        engine:          "bounty",
        title:           opp.title,
        description:     opp.description,
        status:          "pending",
        priority:        opp.score > 70 ? 2 : opp.score > 50 ? 4 : 7,
        expected_usd:    opp.reward_usd,
        estimated_hours: opp.estimated_hours,
        opportunity_id:  id,
        repo_url:        opp.repo_url,
        requires_approval: false,
        progress_note:   "Queued — waiting for agent",
        progress_pct:    0,
        user_id:         user.id,
      });
    } else {
      await db.from("income_work_queue")
        .update({ status: "pending", progress_note: "Queued — waiting for agent", progress_pct: 0 })
        .eq("id", existing.id);
    }

    queued.push(id);
  }

  await db.from("income_activity_log").insert({
    engine: "bounty", action: "batch_queued",
    detail: `${queued.length} opportunities queued for agent`,
    status: "ok", user_id: user.id,
  });

  return NextResponse.json({ queued: queued.length });
}
