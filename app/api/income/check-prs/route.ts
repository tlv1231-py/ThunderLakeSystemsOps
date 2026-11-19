import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+?)\/pull(?:s)?\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: parseInt(m[3]) };
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient() as any;

  // Resolve user
  let userId: string | null = null;
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
  userId = users?.users?.[0]?.id ?? null;

  // All submitted PRs that haven't been resolved yet
  const { data: items } = await db
    .from("income_work_queue")
    .select("*, income_opportunities(*)")
    .eq("status", "submitted")
    .not("pr_url", "is", null);

  if (!items?.length) {
    return NextResponse.json({ ok: true, checked: 0, merged: 0, closed: 0 });
  }

  const ghHeaders: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "TLS-Income-Agent/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    ghHeaders["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  let merged = 0;
  let closed = 0;
  const errors: string[] = [];

  for (const item of items) {
    const parsed = parsePrUrl(item.pr_url);
    if (!parsed) continue;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`,
        { headers: ghHeaders, next: { revalidate: 0 } }
      );

      if (res.status === 404) {
        // PR deleted or repo gone — skip silently
        continue;
      }
      if (!res.ok) {
        errors.push(`${item.pr_url}: HTTP ${res.status}`);
        continue;
      }

      const pr = await res.json();
      const opp = item.income_opportunities;

      if (pr.merged === true) {
        // ── MERGED: we got picked ──────────────────────────────────────────
        const mergedDate = (pr.merged_at ?? new Date().toISOString()).split("T")[0];

        await db.from("income_work_queue")
          .update({
            status:        "done",
            progress_pct:  100,
            progress_note: `PR merged ${mergedDate} ✓`,
            completed_at:  pr.merged_at ?? new Date().toISOString(),
          })
          .eq("id", item.id);

        if (item.opportunity_id) {
          await db.from("income_opportunities")
            .update({ status: "accepted" })
            .eq("id", item.opportunity_id);
        }

        // Create pending earning — payment expected from Opire
        await db.from("income_earnings").insert({
          engine:         "bounty",
          source:         opp?.source ?? "github",
          description:    item.title,
          amount_usd:     item.expected_usd ?? 0,
          status:         "pending",
          earned_date:    mergedDate,
          reference:      item.pr_url,
          evidence_url:   item.pr_url,
          opportunity_id: item.opportunity_id ?? null,
          user_id:        item.user_id ?? userId,
        });

        // Approval item — prompts user to confirm payment received
        await db.from("income_approvals").insert({
          title:        `Confirm payment: ${item.title.slice(0, 80)}`,
          description:  `Your PR was merged — Opire should pay automatically via Stripe.\n\nPR: ${item.pr_url}\nExpected: $${item.expected_usd ?? "?"}\n\nMark done here once the payment lands in your Stripe account.`,
          action_type:  "claim_bounty",
          action_url:   item.pr_url,
          action_data:  { pr_url: item.pr_url, merged_at: pr.merged_at },
          status:       "pending",
          priority:     1,
          opportunity_id: item.opportunity_id ?? null,
          user_id:      item.user_id ?? userId,
        });

        await db.from("income_activity_log").insert({
          engine:  "bounty",
          action:  "pr_merged",
          detail:  `MERGED: ${item.title} — $${item.expected_usd ?? "?"}`,
          status:  "ok",
          user_id: item.user_id ?? userId,
        });

        merged++;

      } else if (pr.state === "closed" && !pr.merged) {
        // ── CLOSED/REJECTED ────────────────────────────────────────────────
        await db.from("income_work_queue")
          .update({
            status:        "failed",
            progress_note: "PR closed without merge",
          })
          .eq("id", item.id);

        if (item.opportunity_id) {
          await db.from("income_opportunities")
            .update({ status: "rejected" })
            .eq("id", item.opportunity_id);
        }

        await db.from("income_activity_log").insert({
          engine:  "bounty",
          action:  "pr_closed",
          detail:  `PR closed/rejected: ${item.title}`,
          status:  "warning",
          user_id: item.user_id ?? userId,
        });

        closed++;
      }
      // else: still open — no action

    } catch (e: any) {
      errors.push(`${item.pr_url}: ${e.message}`);
    }
  }

  // Log the check run
  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "pr_check_run",
    detail:  `Checked ${items.length} PRs — ${merged} merged, ${closed} closed${errors.length ? `, ${errors.length} errors` : ""}`,
    status:  errors.length > 0 && merged === 0 ? "warning" : "ok",
    user_id: userId,
  });

  return NextResponse.json({
    ok:      true,
    checked: items.length,
    merged,
    closed,
    errors,
  });
}
