import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// ── Frantic Bounty Claim + Deliver Pipeline ───────────────────────────────────
// Triggered automatically by /api/income/discover when FRANTIC_AGENT_TOKEN is set
// and new Frantic bounties are found.
//
// Flow per bounty:
//   1. Find queued Frantic items in income_work_queue
//   2. Fetch full bounty details (delivery_contract, acceptance_criteria)
//   3. POST /v1/claims to claim the bounty slot (1 hour fuse to deliver)
//   4. Generate deliverable with Claude based on acceptance criteria
//   5. POST /v1/deliveries with artifact_refs (content as report= or gist public_url=)
//   6. Update income_work_queue + income_activity_log

const FRANTIC_UA = "ThunderLakeSystems/1.0";
const FRANTIC_BASE = "https://gofrantic.com";
const FRANTIC_API  = "https://api.gofrantic.com";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentToken = process.env.FRANTIC_AGENT_TOKEN;
  const agentKid   = process.env.FRANTIC_AGENT_KID;
  if (!agentToken || !agentKid) {
    return NextResponse.json({
      error: "FRANTIC_AGENT_TOKEN or FRANTIC_AGENT_KID not configured",
      setup: "Call POST /api/income/frantic-signup to register as a Frantic agent",
    }, { status: 503 });
  }

  const db = createAdminClient() as any;
  const userId = process.env.INCOME_AGENT_USER_ID ?? null;

  // Find queued Frantic items
  const { data: queued } = await db
    .from("income_work_queue")
    .select("*, income_opportunities(*)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(3);

  const franticItems = (queued ?? []).filter(
    (wq: any) => wq.income_opportunities?.source === "frantic"
  );

  if (!franticItems.length) {
    return NextResponse.json({ ok: true, submitted: 0, message: "No queued Frantic items" });
  }

  const anthropic = new Anthropic();
  let submittedCount = 0;
  const results: any[] = [];

  for (const wqItem of franticItems as any[]) {
    const opp = wqItem.income_opportunities;
    if (!opp) continue;

    const bountyNumber = opp.metadata?.bounty_number ?? opp.external_id;
    const apiUrl = opp.metadata?.api_url ?? `${FRANTIC_API}/v1/bounties/${bountyNumber}`;
    const title = opp.title ?? `Frantic Bounty #${bountyNumber}`;

    try {
      // 1. Fetch full bounty details
      const bountyRes = await fetch(apiUrl, {
        headers: { "User-Agent": FRANTIC_UA, "Authorization": `Bearer ${agentToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!bountyRes.ok) {
        results.push({ title, status: "skip", reason: `Bounty fetch failed: ${bountyRes.status}` });
        continue;
      }
      const bounty = await bountyRes.json();
      const deliveryContract   = bounty.delivery_contract ?? bounty.deliveryContract ?? "";
      const acceptanceCriteria = bounty.acceptance_criteria ?? bounty.acceptanceCriteria ?? "";
      const description        = bounty.description ?? opp.description ?? "";

      // Skip bounties that require external publishing (Twitter, social media posts)
      const needsPublishing = /twitter|tweet|x\.com|instagram|linkedin|youtube|tiktok/i.test(deliveryContract + acceptanceCriteria);
      if (needsPublishing) {
        await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", opp.id);
        await db.from("income_work_queue").update({ status: "cancelled", progress_note: "Requires social media publishing — skipped" }).eq("id", wqItem.id);
        results.push({ title, status: "dismissed", reason: "Requires social media publishing" });
        continue;
      }

      // 2. Claim the bounty
      const claimRes = await fetch(`${FRANTIC_BASE}/v1/claims`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": FRANTIC_UA,
          "Authorization": `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          bounty: bountyNumber,
          agent_kid: agentKid,
          agent_token: agentToken,
        }),
      });

      if (!claimRes.ok) {
        const claimErr = await claimRes.text();
        // No claim slots or already claimed — skip gracefully
        if (claimRes.status === 409 || claimRes.status === 404) {
          await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", opp.id);
          await db.from("income_work_queue").update({ status: "cancelled", progress_note: `Claim failed: ${claimErr.slice(0, 100)}` }).eq("id", wqItem.id);
          results.push({ title, status: "dismissed", reason: `Claim rejected: ${claimErr.slice(0, 100)}` });
          continue;
        }
        results.push({ title, status: "error", error: `Claim failed ${claimRes.status}: ${claimErr.slice(0, 200)}` });
        continue;
      }

      const claimData = await claimRes.json();
      const claimId: string = claimData.claim_id ?? claimData.id ?? String(Date.now());

      await db.from("income_work_queue").update({
        status: "in_progress",
        progress_note: `Claimed (claim_id=${claimId}) — generating delivery`,
        progress_pct: 25,
      }).eq("id", wqItem.id);

      // 3. Generate deliverable with Claude
      const prompt = `You are fulfilling a paid bounty on Frantic, an AI-agent bounty platform.

BOUNTY: "${title}"
REWARD: $${opp.reward_usd ?? "?"} USDC

DESCRIPTION:
${description.slice(0, 2000)}

DELIVERY CONTRACT:
${deliveryContract.slice(0, 1000)}

ACCEPTANCE CRITERIA:
${acceptanceCriteria.slice(0, 1000)}

Produce a complete, high-quality deliverable that fully satisfies the acceptance criteria.
Be specific, thorough, and directly useful to the bounty poster.
Format as a clear document with sections as appropriate.`;

      const aiResponse = await anthropic.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const content = aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";
      if (!content) {
        results.push({ title, status: "error", error: "Claude returned empty content" });
        continue;
      }

      // 4. Build artifact_refs — try GitHub Gist for public_url if GitHub token available
      const artifactRefs: string[] = [];
      const needsPublicUrl = /public_url/i.test(deliveryContract + acceptanceCriteria);

      if (needsPublicUrl && process.env.GITHUB_TOKEN) {
        try {
          const gistRes = await fetch("https://api.github.com/gists", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
              "Content-Type": "application/json",
              "User-Agent": FRANTIC_UA,
            },
            body: JSON.stringify({
              description: `Frantic bounty delivery: ${title}`,
              public: true,
              files: { "delivery.md": { content } },
            }),
          });
          if (gistRes.ok) {
            const gist = await gistRes.json();
            artifactRefs.push(`public_url=${gist.html_url}`);
            artifactRefs.push(`source_url=${gist.html_url}`);
          }
        } catch { /* fall through to report artifact */ }
      }

      // Always include the report content as an artifact
      artifactRefs.push(`report=${content.slice(0, 8000)}`);

      // 5. Submit delivery
      const deliveryRes = await fetch(`${FRANTIC_BASE}/v1/deliveries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": FRANTIC_UA,
          "Authorization": `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          claim_id: claimId,
          artifact_refs: artifactRefs,
          agent_kid: agentKid,
          agent_token: agentToken,
        }),
      });

      const deliveryOk = deliveryRes.ok;
      const deliveryData = deliveryOk ? await deliveryRes.json() : await deliveryRes.text();

      // 6. Update records
      await db.from("income_work_queue").update({
        status: deliveryOk ? "submitted" : "failed",
        pr_url: opp.url,
        progress_note: deliveryOk
          ? `Delivered to Frantic (claim_id=${claimId})`
          : `Delivery failed: ${String(deliveryData).slice(0, 150)}`,
        progress_pct: deliveryOk ? 100 : 0,
      }).eq("id", wqItem.id);

      await db.from("income_opportunities")
        .update({ status: deliveryOk ? "submitted" : "in_progress" })
        .eq("id", opp.id);

      await db.from("income_activity_log").insert({
        engine: "bounty", action: deliveryOk ? "frantic_delivered" : "frantic_delivery_error",
        status: deliveryOk ? "ok" : "warning",
        detail: deliveryOk
          ? `Frantic "${title}" — delivered $${opp.reward_usd ?? "?"} USDC bounty`
          : `Frantic "${title}" — delivery failed`,
        metadata: { claim_id: claimId, bounty_number: bountyNumber, artifacts: artifactRefs.length },
        user_id: userId,
      });

      if (deliveryOk) submittedCount++;
      results.push({ title, status: deliveryOk ? "delivered" : "failed", reward: opp.reward_usd, claimId });

    } catch (e) {
      results.push({ title, status: "error", error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, submitted: submittedCount, results });
}
