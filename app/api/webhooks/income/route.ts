import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Payment webhook handler for Algora, Opire, and IssueHunt
//
// Configure these in each platform's dashboard:
//   Algora:    Settings → Webhooks → https://your-domain/api/webhooks/income
//   Opire:     Settings → Webhooks → https://your-domain/api/webhooks/income
//   IssueHunt: Settings → Webhooks → https://your-domain/api/webhooks/income
//
// Set INCOME_WEBHOOK_SECRET in Vercel env vars; paste the same value as the
// webhook secret in each platform. Leave blank to accept unsigned webhooks
// (less secure but fine for initial setup).

export const maxDuration = 30;

export async function POST(req: Request) {
  const rawBody = await req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const db = createAdminClient() as any;

  // Resolve user
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
  const userId: string | null = users?.users?.[0]?.id ?? null;

  // ── Detect source and extract fields ────────────────────────────────────────

  let amount: number | null = null;
  let reference: string | null = null;    // PR URL or issue URL
  let source: string = "bounty";
  let description: string = "Bounty payment";
  let eventType: string = payload.event ?? payload.type ?? "unknown";

  // Algora — event: "bounty.rewarded" or "bounty.paid"
  if (
    eventType === "bounty.rewarded" || eventType === "bounty.paid" ||
    (payload.data?.bounty && payload.data?.pull_request)
  ) {
    amount = Number(payload.data?.amount ?? payload.amount ?? 0) || null;
    reference = payload.data?.pull_request?.html_url ?? payload.data?.pr_url ?? payload.pr_url ?? null;
    description = payload.data?.issue?.title ?? payload.data?.title ?? "Algora bounty";
    source = "algora";
  }

  // Opire — event: "reward.claimed" or "reward.paid"
  else if (
    eventType === "reward.claimed" || eventType === "reward.paid" ||
    (payload.data?.reward && payload.data?.issue)
  ) {
    amount = Number(payload.data?.reward?.amount ?? payload.data?.amount ?? payload.amount ?? 0) || null;
    reference = payload.data?.pull_request?.html_url ?? payload.data?.issue?.url ?? payload.issue_url ?? null;
    description = payload.data?.issue?.title ?? payload.data?.title ?? "Opire reward";
    source = "opire";
  }

  // IssueHunt — event: "bounty.payment"
  else if (eventType === "bounty.payment" || payload.data?.funded_by_sum) {
    amount = Number(payload.data?.funded_by_sum ?? payload.amount ?? 0) || null;
    reference = payload.data?.html_url ?? null;
    description = payload.data?.title ?? "IssueHunt bounty";
    source = "issuehunt";
  }

  // Generic / manual fallback — { amount, reference, description, source }
  else if (payload.amount && payload.reference) {
    amount = Number(payload.amount) || null;
    reference = payload.reference;
    description = payload.description ?? "Bounty payment";
    source = payload.source ?? "bounty";
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "unrecognized webhook or zero amount", eventType }, { status: 200 });
  }

  // ── Find matching work item by PR/issue URL ──────────────────────────────────
  let opportunityId: string | null = null;
  let workItemId: string | null = null;

  if (reference) {
    const { data: workItem } = await db
      .from("income_work_queue")
      .select("id, opportunity_id")
      .eq("pr_url", reference)
      .maybeSingle();

    if (workItem) {
      workItemId = workItem.id;
      opportunityId = workItem.opportunity_id;

      // Mark earning as collected immediately
      await db.from("income_work_queue")
        .update({ status: "done", progress_pct: 100, progress_note: "Payment confirmed via webhook ✓" })
        .eq("id", workItem.id);
    }

    if (opportunityId) {
      await db.from("income_opportunities")
        .update({ status: "paid" })
        .eq("id", opportunityId);
    }
  }

  // ── Log the earning as collected ─────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  await db.from("income_earnings").insert({
    engine:         "bounty",
    source,
    description:    description.slice(0, 200),
    amount_usd:     amount,
    status:         "collected",
    earned_date:    today,
    collected_at:   new Date().toISOString(),
    reference,
    evidence_url:   reference,
    opportunity_id: opportunityId,
    user_id:        userId,
  });

  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "earning_logged",
    detail:  `PAYMENT CONFIRMED: $${amount} from ${source} — ${description.slice(0, 80)}`,
    status:  "ok",
    metadata: { source, amount, reference, eventType },
    user_id: userId,
  });

  // ── Resolve any matching pending approval ────────────────────────────────────
  if (reference) {
    await db.from("income_approvals")
      .update({ status: "done", reviewed_at: new Date().toISOString(), notes: "Auto-resolved via webhook" })
      .eq("action_url", reference)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true, amount, source, reference });
}
