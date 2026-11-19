"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Opportunity actions ───────────────────────────────────────────────────────

export async function setActiveMode(on: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_activity_log").insert({
    engine: "system", action: "active_mode",
    status: on ? "on" : "off",
    detail: on ? "Active Mode started" : "Active Mode stopped",
    user_id: user.id,
  });
  revalidatePath("/income");
}

export async function dismissOpportunity(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_opportunities").update({ status: "dismissed" })
    .eq("id", id).eq("user_id", user.id);
  await db.from("income_activity_log").insert({
    engine: "bounty", action: "opportunity_dismissed",
    status: "ok", user_id: user.id,
  });
  revalidatePath("/income");
}

export async function queueOpportunity(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;

  const { data: opp } = await db
    .from("income_opportunities").select("*").eq("id", id).single();
  if (!opp) throw new Error("Opportunity not found");

  await db.from("income_opportunities").update({ status: "queued" })
    .eq("id", id).eq("user_id", user.id);

  await db.from("income_work_queue").insert({
    engine: "bounty",
    title: opp.title,
    description: opp.description,
    status: "pending",
    priority: opp.score > 70 ? 2 : opp.score > 50 ? 4 : 7,
    expected_usd: opp.reward_usd,
    estimated_hours: opp.estimated_hours,
    opportunity_id: id,
    requires_approval: true,
    approval_action: `Review solution, then submit PR to: ${opp.url}`,
    user_id: user.id,
  });

  await db.from("income_activity_log").insert({
    engine: "bounty", action: "opportunity_queued",
    detail: opp.title, status: "ok", user_id: user.id,
  });

  revalidatePath("/income");
}

export async function markOpportunityInProgress(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_opportunities").update({ status: "in_progress" })
    .eq("id", id).eq("user_id", user.id);
  await db.from("income_work_queue")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("opportunity_id", id).eq("user_id", user.id);
  revalidatePath("/income");
}

export async function requestSubmitApproval(oppId: string, prUrl: string, notes: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;

  const { data: opp } = await db.from("income_opportunities").select("*").eq("id", oppId).single();

  await db.from("income_approvals").insert({
    title: `Submit PR: ${opp?.title ?? oppId}`,
    description: `Review the prepared solution and submit the pull request to claim the bounty.\n\nPR: ${prUrl}\n\nNotes: ${notes}`,
    action_type: "submit_pr",
    action_url: prUrl,
    action_data: { pr_url: prUrl, notes },
    status: "pending",
    priority: 2,
    opportunity_id: oppId,
    user_id: user.id,
  });

  await db.from("income_opportunities").update({ status: "submitted" })
    .eq("id", oppId).eq("user_id", user.id);

  revalidatePath("/income");
}

// ── Approval actions ─────────────────────────────────────────────────────────

export async function approveAction(approvalId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_approvals")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", approvalId).eq("user_id", user.id);
  await db.from("income_activity_log").insert({
    engine: null, action: "approval_approved",
    status: "ok", user_id: user.id,
  });
  revalidatePath("/income");
}

export async function rejectAction(approvalId: string, notes?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_approvals")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), notes: notes ?? null })
    .eq("id", approvalId).eq("user_id", user.id);
  revalidatePath("/income");
}

// ── Earnings actions ─────────────────────────────────────────────────────────

export async function logEarning(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;

  await db.from("income_earnings").insert({
    engine:      formData.get("engine"),
    source:      formData.get("source"),
    description: formData.get("description"),
    amount_usd:  parseFloat(String(formData.get("amount_usd"))),
    status:      formData.get("status") ?? "pending",
    earned_date: formData.get("earned_date"),
    reference:   formData.get("reference") ?? null,
    evidence_url:formData.get("evidence_url") ?? null,
    opportunity_id: formData.get("opportunity_id") ?? null,
    user_id:     user.id,
  });

  await db.from("income_activity_log").insert({
    engine: String(formData.get("engine")), action: "earning_logged",
    detail: `${formData.get("description")} — $${formData.get("amount_usd")}`,
    status: "ok", user_id: user.id,
  });

  revalidatePath("/income");
}

export async function markEarningCollected(earningId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_earnings")
    .update({ status: "collected", collected_at: new Date().toISOString() })
    .eq("id", earningId).eq("user_id", user.id);
  revalidatePath("/income");
}

// ── Work queue actions ────────────────────────────────────────────────────────

export async function updateWorkHours(workId: string, hours: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;
  await db.from("income_work_queue")
    .update({ hours_invested: hours })
    .eq("id", workId).eq("user_id", user.id);
  revalidatePath("/income");
}

// ── Asset actions ─────────────────────────────────────────────────────────────

export async function createAsset(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;

  const { data: asset } = await db.from("income_assets").insert({
    engine:       formData.get("engine"),
    name:         formData.get("name"),
    category:     formData.get("category") ?? null,
    description:  formData.get("description") ?? null,
    marketplace:  formData.get("marketplace") ?? null,
    status:       "draft",
    production_date: new Date().toISOString().split("T")[0],
    user_id:      user.id,
  }).select().single();

  if (asset) {
    await db.from("income_approvals").insert({
      title: `Publish: ${asset.name}`,
      description: `Review and publish "${asset.name}" to ${formData.get("marketplace") ?? "marketplace"}.`,
      action_type: "publish_asset",
      action_data: { asset_id: asset.id, marketplace: formData.get("marketplace") },
      status: "pending",
      priority: 5,
      asset_id: asset.id,
      user_id: user.id,
    });
  }

  revalidatePath("/income");
}

// ── Mark a merged bounty as paid ─────────────────────────────────────────────

export async function markBountyPaid(workItemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const db = supabase as any;

  const { data: item } = await db.from("income_work_queue")
    .select("*").eq("id", workItemId).eq("user_id", user.id).single();
  if (!item) throw new Error("Work item not found");

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date().toISOString();

  // Find an existing pending earning for this opportunity, if any
  if (item.opportunity_id) {
    const { data: existing } = await db.from("income_earnings")
      .select("id").eq("opportunity_id", item.opportunity_id)
      .eq("user_id", user.id).eq("status", "pending").maybeSingle();
    if (existing) {
      await db.from("income_earnings")
        .update({ status: "collected", collected_at: now }).eq("id", existing.id);
    } else {
      // No pending earning found — create one (IssueHunt / manual platforms)
      await db.from("income_earnings").insert({
        engine:         "bounty",
        source:         item.metadata?.source ?? "github",
        description:    item.title,
        amount_usd:     item.expected_usd ?? 0,
        status:         "collected",
        earned_date:    today,
        collected_at:   now,
        reference:      item.pr_url ?? null,
        evidence_url:   item.pr_url ?? null,
        opportunity_id: item.opportunity_id ?? null,
        user_id:        user.id,
      });
    }
    // Mark opportunity paid
    await db.from("income_opportunities")
      .update({ status: "paid" }).eq("id", item.opportunity_id).eq("user_id", user.id);
  }

  // Dismiss any pending approvals referencing this PR
  if (item.pr_url) {
    await db.from("income_approvals")
      .update({ status: "done", reviewed_at: now, notes: "Marked paid by user" })
      .eq("user_id", user.id).eq("status", "pending")
      .ilike("action_url", `%${item.pr_url}%`);
  }

  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "earning_logged",
    detail:  `PAYMENT CONFIRMED: $${item.expected_usd ?? "?"} — ${item.title}`,
    status:  "ok",
    user_id: user.id,
  });

  revalidatePath("/income");
}

// ── Trigger discovery from dashboard ─────────────────────────────────────────

export async function triggerDiscovery() {
  // Fire-and-forget: call the discover endpoint from server side
  // We can't await it (60s timeout) so we just kick it off
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  fetch(`${base}/api/income/discover`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  }).catch(() => {});
}
