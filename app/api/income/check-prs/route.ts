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

  let userId: string | null = process.env.INCOME_AGENT_USER_ID ?? null;
  if (!userId) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
    userId = users?.users?.[0]?.id ?? null;
  }

  // ── 1. ZOMBIE CLEANUP: fail in_progress items stuck > 4 hours ───────────────
  const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
  const { data: zombies } = await db
    .from("income_work_queue")
    .select("id, opportunity_id, title")
    .eq("status", "in_progress")
    .lt("started_at", fourHoursAgo);

  let zombieCount = 0;
  for (const zombie of zombies ?? []) {
    await db.from("income_work_queue")
      .update({ status: "failed", progress_note: "Zombie: in_progress >4h — agent likely died or was interrupted" })
      .eq("id", zombie.id);
    if (zombie.opportunity_id) {
      await db.from("income_opportunities").update({ status: "queued" }).eq("id", zombie.opportunity_id);
    }
    zombieCount++;
  }
  if (zombieCount > 0) {
    await db.from("income_activity_log").insert({
      engine: "bounty", action: "pr_check_run",
      detail: `Zombie cleanup: ${zombieCount} stuck in_progress items reset to queued`,
      status: "warning", user_id: userId,
    });
  }

  // ── 2. STALE OPPORTUNITY CLEANUP: dismiss opps stuck in discovered/queued >30 days ──
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: staleOpps } = await db
    .from("income_opportunities")
    .select("id, title, status, created_at")
    .eq("user_id", userId)
    .in("status", ["discovered", "queued"])
    .lt("created_at", thirtyDaysAgo)
    .limit(20);

  let staleOppCount = 0;
  for (const stale of staleOpps ?? []) {
    await db.from("income_opportunities")
      .update({ status: "dismissed" })
      .eq("id", stale.id);
    staleOppCount++;
  }

  const { data: items } = await db
    .from("income_work_queue")
    .select("*, income_opportunities(*)")
    .in("status", ["submitted", "review"])
    .not("pr_url", "is", null);

  if (!items?.length) {
    return NextResponse.json({ ok: true, checked: 0, merged: 0, closed: 0, flagged: 0, zombies: zombieCount, staleOpps: staleOppCount });
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
  let flagged = 0;
  const errors: string[] = [];

  for (const item of items) {
    const parsed = parsePrUrl(item.pr_url);

    // ── Frantic: poll bounty status instead of GitHub PR ──────────────────────
    if (!parsed) {
      const opp = item.income_opportunities;
      if (opp?.source === "frantic" && process.env.FRANTIC_AGENT_TOKEN) {
        const bountyNumber = opp.metadata?.bounty_number;
        const apiUrl = opp.metadata?.api_url ?? (bountyNumber ? `https://api.gofrantic.com/v1/bounties/${bountyNumber}` : null);
        if (apiUrl) {
          try {
            const bRes = await fetch(apiUrl, {
              headers: { "Authorization": `Bearer ${process.env.FRANTIC_AGENT_TOKEN}`, "User-Agent": "TLS-Income-Agent/1.0" },
              signal: AbortSignal.timeout(10_000),
            });
            if (bRes.ok) {
              const bounty = await bRes.json();
              const st = (bounty.status ?? "").toLowerCase();
              const isPaid     = st === "paid" || bounty.paid === true || st === "completed" || st === "accepted";
              const isExpired  = st === "expired" || st === "rejected" || st === "closed" || st === "cancelled";
              if (isPaid) {
                const earnedDate = new Date().toISOString().split("T")[0];
                await db.from("income_work_queue").update({ status: "done", progress_pct: 100, progress_note: "Frantic: accepted — USDC payout incoming", completed_at: new Date().toISOString() }).eq("id", item.id);
                if (item.opportunity_id) await db.from("income_opportunities").update({ status: "accepted" }).eq("id", item.opportunity_id);
                await db.from("income_earnings").insert({ engine: "bounty", source: "frantic", description: item.title, amount_usd: item.expected_usd ?? 0, status: "pending", earned_date: earnedDate, reference: item.pr_url, evidence_url: item.pr_url, opportunity_id: item.opportunity_id ?? null, user_id: item.user_id ?? userId });
                await db.from("income_approvals").insert({ title: `Frantic payout: ${item.title.slice(0, 80)}`, description: `Frantic bounty accepted — USDC should arrive on Base within hours.\n\nBounty: ${item.pr_url}\nExpected: $${item.expected_usd ?? "?"}`, action_type: "claim_bounty", action_url: item.pr_url, action_data: { bounty_number: bountyNumber }, status: "pending", priority: 1, opportunity_id: item.opportunity_id ?? null, user_id: item.user_id ?? userId });
                await db.from("income_activity_log").insert({ engine: "bounty", action: "pr_merged", detail: `PR merged: "${item.title}" — $${item.expected_usd ?? "?"} USDC incoming — payment should arrive via platform`, status: "ok", user_id: item.user_id ?? userId });
                merged++;
              } else if (isExpired) {
                await db.from("income_work_queue").update({ status: "failed", progress_note: `Frantic: ${st}` }).eq("id", item.id);
                if (item.opportunity_id) await db.from("income_opportunities").update({ status: "rejected" }).eq("id", item.opportunity_id);
                await db.from("income_activity_log").insert({ engine: "bounty", action: "pr_closed", detail: `PR rejected: "${item.title}" — ${st}, no payout`, status: "warning", user_id: item.user_id ?? userId });
                closed++;
              }
            }
          } catch { /* non-fatal */ }
        }
      }
      continue;
    }

    const { owner, repo, number } = parsed;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
        { headers: ghHeaders, next: { revalidate: 0 } }
      );

      if (res.status === 404) continue;
      if (!res.ok) { errors.push(`${item.pr_url}: HTTP ${res.status}`); continue; }

      const pr = await res.json();
      const opp = item.income_opportunities;

      if (pr.merged === true) {
        // ── MERGED ────────────────────────────────────────────────────────────
        const mergedDate = (pr.merged_at ?? new Date().toISOString()).split("T")[0];

        await db.from("income_work_queue")
          .update({ status: "done", progress_pct: 100, progress_note: `PR merged ${mergedDate} ✓`, completed_at: pr.merged_at ?? new Date().toISOString() })
          .eq("id", item.id);

        if (item.opportunity_id) {
          await db.from("income_opportunities").update({ status: "accepted" }).eq("id", item.opportunity_id);
        }

        await db.from("income_earnings").insert({
          engine: "bounty", source: opp?.source ?? "github",
          description: item.title, amount_usd: item.expected_usd ?? 0,
          status: "pending", earned_date: mergedDate,
          reference: item.pr_url, evidence_url: item.pr_url,
          opportunity_id: item.opportunity_id ?? null,
          user_id: item.user_id ?? userId,
        });

        await db.from("income_approvals").insert({
          title: `Confirm payment: ${item.title.slice(0, 80)}`,
          description: `Your PR was merged — payment should arrive via Stripe.\n\nPR: ${item.pr_url}\nExpected: $${item.expected_usd ?? "?"}\n\nMark done once payment lands.`,
          action_type: "claim_bounty", action_url: item.pr_url,
          action_data: { pr_url: item.pr_url, merged_at: pr.merged_at },
          status: "pending", priority: 1,
          opportunity_id: item.opportunity_id ?? null,
          user_id: item.user_id ?? userId,
        });

        const mergedReward = item.expected_usd ? ` — $${item.expected_usd} incoming` : "";
        await db.from("income_activity_log").insert({
          engine: "bounty", action: "pr_merged",
          detail: `PR merged: "${item.title}"${mergedReward} — payment should arrive via platform`,
          status: "ok", user_id: item.user_id ?? userId,
        });

        merged++;

      } else if (pr.state === "closed" && !pr.merged) {
        // ── CLOSED/REJECTED ───────────────────────────────────────────────────
        // Detect self-close: agent closed it (CRLF contamination) vs maintainer rejection.
        // Heuristic: PR was closed by the same user who opened it → agent self-close → re-queue.
        const closedByUs = pr.closed_by?.login === pr.user?.login;
        const noteHasCRLF = (item.progress_note ?? "").toLowerCase().includes("crlf");
        const isAgentClose = closedByUs || noteHasCRLF;

        if (isAgentClose) {
          // Re-queue for clean re-attempt
          await db.from("income_work_queue")
            .update({ status: "failed", progress_note: "CRLF-closed by agent — re-queued for clean re-submit" })
            .eq("id", item.id);
          if (item.opportunity_id) {
            await db.from("income_opportunities").update({ status: "queued" }).eq("id", item.opportunity_id);
          }
          await db.from("income_activity_log").insert({
            engine: "bounty", action: "pr_closed",
            detail: `PR self-closed (CRLF): "${item.title}" — re-queued for clean re-submit`,
            status: "warning", user_id: item.user_id ?? userId,
          });
        } else {
          // Maintainer closed it — mark rejected
          await db.from("income_work_queue")
            .update({ status: "failed", progress_note: "PR closed without merge" })
            .eq("id", item.id);
          if (item.opportunity_id) {
            await db.from("income_opportunities").update({ status: "rejected" }).eq("id", item.opportunity_id);
          }
          await db.from("income_activity_log").insert({
            engine: "bounty", action: "pr_closed",
            detail: `PR rejected: "${item.title}" — maintainer closed without merging`,
            status: "warning", user_id: item.user_id ?? userId,
          });
        }

        closed++;

      } else {
        // ── STILL OPEN: check CI + reviews ───────────────────────────────────
        const headSha = pr.head?.sha;
        let ciNote = "";
        let reviewNote = "";
        let changesRequested = false;

        // CI check runs
        if (headSha) {
          try {
            const ciRes = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/check-runs`,
              { headers: { ...ghHeaders, Accept: "application/vnd.github+json" } }
            );
            if (ciRes.ok) {
              const ciData = await ciRes.json();
              const runs: any[] = ciData.check_runs ?? [];
              if (runs.length > 0) {
                const failing = runs.filter(r => r.conclusion === "failure" || r.conclusion === "timed_out");
                const passing = runs.filter(r => r.conclusion === "success");
                const pending = runs.filter(r => !r.conclusion || r.conclusion === "neutral");
                if (failing.length > 0) {
                  ciNote = `CI: ${failing.length} failing (${failing.map(r => r.name).slice(0, 2).join(", ")})`;
                } else if (pending.length > 0) {
                  ciNote = `CI: ${pending.length} running`;
                } else if (passing.length > 0) {
                  ciNote = `CI: ${passing.length} passing ✓`;
                }
              }
            }
          } catch { /* non-fatal */ }
        }

        // Review state
        try {
          const reviewsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews`,
            { headers: ghHeaders }
          );
          if (reviewsRes.ok) {
            const reviews: any[] = await reviewsRes.json();
            if (reviews.length > 0) {
              // Latest meaningful review per reviewer
              const byReviewer = new Map<string, any>();
              for (const r of reviews) {
                if (r.state !== "COMMENTED") byReviewer.set(r.user?.login, r);
              }
              const latest = [...byReviewer.values()].sort(
                (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
              )[0];
              if (latest) {
                if (latest.state === "CHANGES_REQUESTED") {
                  changesRequested = true;
                  const body = (latest.body ?? "").slice(0, 120);
                  reviewNote = `Changes requested by @${latest.user?.login}${body ? `: ${body}` : ""}`;
                } else if (latest.state === "APPROVED") {
                  reviewNote = `Approved by @${latest.user?.login} ✓`;
                }
              }
            }
          }
        } catch { /* non-fatal */ }

        // PR comments — surface maintainer questions/replies to the dashboard
        try {
          const commentsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=10&sort=created&direction=desc`,
            { headers: ghHeaders }
          );
          if (commentsRes.ok) {
            const comments: any[] = await commentsRes.json();
            // Find comments from non-bot maintainers (not tlv1231-py, not github-actions)
            const maintainerComments = comments.filter(c => {
              const login = (c.user?.login ?? "").toLowerCase();
              return !login.includes("bot") && !login.includes("tlv1231") && login !== "github-actions[bot]";
            });
            if (maintainerComments.length > 0) {
              const latest = maintainerComments[0];
              const lastSeenKey = `pr_comment_${item.id}`;
              const latestCommentId = latest.id;
              // Check if we've already surfaced this comment
              const lastNoteMatch = (item.progress_note ?? "").includes(`comment:${latestCommentId}`);
              if (!lastNoteMatch) {
                const author = latest.user?.login ?? "maintainer";
                const body = (latest.body ?? "").slice(0, 160).replace(/\n+/g, " ");
                // Detect if it's a question or action request
                const isQuestion = /\?|please|could you|can you|would you|fix|change|update|add|remove/i.test(body);
                const commentNote = `${isQuestion ? "⚠️ " : ""}@${author}: "${body}"`;
                await db.from("income_activity_log").insert({
                  engine: "bounty", action: "pr_check_run",
                  detail: `Maintainer reply on "${item.title.slice(0, 50)}" — ${commentNote.slice(0, 200)}`,
                  status: isQuestion ? "warning" : "ok",
                  user_id: item.user_id ?? userId,
                });
                // Store comment id in progress_note so we don't re-surface
                const updatedNote = [ciNote, reviewNote, `comment:${latestCommentId}`].filter(Boolean).join(" · ");
                await db.from("income_work_queue")
                  .update({ progress_note: updatedNote, ...(isQuestion ? { status: "review" } : {}) })
                  .eq("id", item.id);
                if (isQuestion) flagged++;
              }
            }
          }
        } catch { /* non-fatal */ }

        // Stale PR detection: open >14 days with no CI, no reviews, no comments
        try {
          const createdAt = new Date(pr.created_at).getTime();
          const ageMs = Date.now() - createdAt;
          const ageDays = Math.round(ageMs / 86_400_000);
          if (ageDays > 14 && !ciNote && !reviewNote) {
            const staleNote = `Stale: open ${ageDays} days with no CI or review activity`;
            const alreadyFlagged = (item.progress_note ?? "").includes("Stale:");
            if (!alreadyFlagged) {
              await db.from("income_activity_log").insert({
                engine: "bounty", action: "pr_check_run",
                detail: `${staleNote} — "${item.title.slice(0, 60)}"`,
                status: "warning", user_id: item.user_id ?? userId,
              });
              await db.from("income_work_queue")
                .update({ progress_note: staleNote })
                .eq("id", item.id);
            }
          }
        } catch { /* non-fatal */ }

        // Build combined progress note
        const parts = [ciNote, reviewNote].filter(Boolean);
        const newNote = parts.length > 0 ? parts.join(" · ") : item.progress_note;

        if (changesRequested) {
          // Flag for agent re-run with feedback context
          await db.from("income_work_queue")
            .update({ status: "review", progress_note: newNote })
            .eq("id", item.id);

          await db.from("income_activity_log").insert({
            engine: "bounty", action: "pr_check_run",
            detail: `Changes requested on "${item.title}" — ${reviewNote}`,
            status: "warning", user_id: item.user_id ?? userId,
          });
          flagged++;
        } else if (newNote && newNote !== item.progress_note && !newNote.includes("comment:")) {
          await db.from("income_work_queue")
            .update({ progress_note: newNote })
            .eq("id", item.id);
        }
      }

    } catch (e: any) {
      errors.push(`${item.pr_url}: ${e.message}`);
    }
  }

  await db.from("income_activity_log").insert({
    engine: "bounty", action: "pr_check_run",
    detail: `PR check done — ${items.length} open PRs reviewed: ${merged} merged, ${closed} rejected, ${flagged} need changes${zombieCount > 0 ? `, ${zombieCount} zombies cleared` : ""}${staleOppCount > 0 ? `, ${staleOppCount} stale opps dismissed` : ""}${errors.length ? `, ${errors.length} errors` : ""}`,
    status: errors.length > 0 && merged === 0 ? "warning" : "ok",
    user_id: userId,
  });

  // ── STRATEGY REPORT: win-rate snapshot ──────────────────────────────────────
  try {
    const { data: allItems } = await db
      .from("income_work_queue")
      .select("status, expected_usd, engine, income_opportunities(source, score, reward_usd)")
      .eq("user_id", userId)
      .in("status", ["done", "failed", "submitted"]);

    if (allItems && allItems.length > 0) {
      const wins   = allItems.filter((i: any) => i.status === "done");
      const losses = allItems.filter((i: any) => i.status === "failed");
      const open   = allItems.filter((i: any) => i.status === "submitted");

      const totalEarned = wins.reduce((s: number, i: any) => s + (i.expected_usd ?? 0), 0);

      // Win rate by platform
      const byPlatform: Record<string, { w: number; l: number; usd: number }> = {};
      for (const item of allItems) {
        const src = (item as any).income_opportunities?.source ?? "unknown";
        if (!byPlatform[src]) byPlatform[src] = { w: 0, l: 0, usd: 0 };
        if (item.status === "done") { byPlatform[src].w++; byPlatform[src].usd += item.expected_usd ?? 0; }
        if (item.status === "failed") byPlatform[src].l++;
      }

      const platformSummary = Object.entries(byPlatform)
        .map(([src, s]) => `${src}: ${s.w}W/${s.l}L ($${s.usd.toFixed(0)})`)
        .join(", ");

      await db.from("income_activity_log").insert({
        engine: "bounty", action: "strategy_report",
        detail: `Strategy snapshot — ${wins.length} wins / ${losses.length} losses / ${open.length} open | $${totalEarned.toFixed(0)} earned | ${platformSummary}`,
        status: "ok", user_id: userId,
      });
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, checked: items.length, merged, closed, flagged, zombies: zombieCount, staleOpps: staleOppCount, errors });
}
