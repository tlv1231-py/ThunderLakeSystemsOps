import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// ── Superteam Earn Content Submission Pipeline ──────────────────────────────
// Requires environment variables:
//   SUPERTEAM_API_KEY  — from agent registration at earn.superteam.fun/agents
//   SUPERTEAM_AGENT_EMAIL — email used during registration
// Without these, endpoint returns 503 with setup instructions.
//
// What it does:
//   1. Finds queued Superteam opportunities (source="superteam", status="queued")
//   2. Fetches the full listing details from Superteam's API
//   3. Generates content using Claude (Twitter thread, article, etc.)
//   4. Posts submission to Superteam's agent submission API
//   5. Updates income_work_queue with pr_url (submission link) + status=submitted

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const superteamKey = process.env.SUPERTEAM_API_KEY;
  if (!superteamKey) {
    return NextResponse.json({
      error: "SUPERTEAM_API_KEY not configured",
      setup: [
        "1. Register at https://earn.superteam.fun (use your email + a Solana wallet address)",
        "2. After registration, your agent API key is at earn.superteam.fun/agents",
        "3. Set SUPERTEAM_API_KEY in Vercel environment variables",
        "4. Also set SUPERTEAM_AGENT_EMAIL to the email you registered with",
      ],
    }, { status: 503 });
  }

  const db = createAdminClient() as any;
  let userId: string | null = process.env.INCOME_AGENT_USER_ID ?? null;
  if (!userId) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
    userId = users?.users?.[0]?.id ?? null;
  }

  // Find queued Superteam items not yet submitted
  const { data: queued } = await db
    .from("income_work_queue")
    .select("*, income_opportunities(*)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .filter("income_opportunities.source", "eq", "superteam")
    .order("priority", { ascending: true })
    .limit(5);

  if (!queued?.length) {
    return NextResponse.json({ ok: true, submitted: 0, message: "No queued Superteam items" });
  }

  const anthropic = new Anthropic();
  let submittedCount = 0;
  const results: any[] = [];

  for (const wqItem of queued as any[]) {
    const opp = wqItem.income_opportunities;
    if (!opp || opp.source !== "superteam") continue;

    const slug = opp.metadata?.slug;
    const listingId = opp.external_id;
    if (!slug || !listingId) continue;

    try {
      // Fetch full listing details from Superteam
      const listingRes = await fetch(
        `https://earn.superteam.fun/api/listings/${slug}`,
        { headers: { Accept: "application/json", "User-Agent": "ThunderLakeSystems/1.0" } }
      );
      const listing = listingRes.ok ? await listingRes.json() : null;
      const requirements = listing?.eligibility ?? [];
      const description = listing?.description ?? opp.description ?? "";
      const title = opp.title ?? listing?.title ?? "Superteam Bounty";
      const reward = opp.reward_usd ?? 0;
      const sponsorName = opp.metadata?.sponsorName ?? "the sponsor";

      // Generate content with Claude
      const contentType = /thread|twitter|tweet/i.test(title) ? "Twitter thread"
        : /article|blog|post/i.test(title) ? "article"
        : /video|script/i.test(title) ? "video script"
        : "written content";

      const prompt = `You are creating ${contentType} for a Superteam Earn bounty.

BOUNTY: "${title}"
SPONSOR: ${sponsorName}
REWARD: $${reward} USDC
DESCRIPTION: ${description.slice(0, 2000)}

Create high-quality, original ${contentType} that directly addresses the bounty requirements.
${contentType === "Twitter thread" ? "Format as numbered tweets (1/, 2/, etc.), 5-10 tweets, each under 280 characters." : ""}
${contentType === "article" ? "Format as a structured article with intro, body sections, and conclusion, 500-800 words." : ""}
Be informative, engaging, and specific to the sponsor's product/ecosystem.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.content[0].type === "text" ? response.content[0].text : "";
      if (!content) continue;

      // Build eligibility answers from listing requirements
      const eligibilityAnswers = requirements.map((q: any) => ({
        question: q.question ?? q.title ?? "Description",
        answer: content.slice(0, 1000),
      }));
      if (!eligibilityAnswers.length) {
        eligibilityAnswers.push({ question: "Submission", answer: content.slice(0, 1000) });
      }

      // Submit to Superteam agent API
      const submitRes = await fetch(
        "https://superteam.fun/api/agents/submissions/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${superteamKey}`,
          },
          body: JSON.stringify({
            listingId,
            link: `https://earn.superteam.fun/listing/${slug}`,
            eligibilityAnswers,
          }),
        }
      );

      if (!submitRes.ok) {
        const err = await submitRes.text();
        await db.from("income_activity_log").insert({
          engine: "bounty", action: "submit_error", status: "warning",
          detail: `Superteam submit failed for "${title}": ${err.slice(0, 200)}`,
          user_id: userId,
        });
        results.push({ title, status: "error", error: err.slice(0, 200) });
        continue;
      }

      const submitData = await submitRes.json();

      // Update work queue to submitted
      await db.from("income_work_queue")
        .update({
          status: "submitted",
          pr_url: `https://earn.superteam.fun/listing/${slug}`,
          progress_note: `Submitted ${contentType} to Superteam (${submittedCount + 1})`,
          progress_pct: 100,
        })
        .eq("id", wqItem.id);

      await db.from("income_opportunities")
        .update({ status: "submitted" })
        .eq("id", opp.id);

      await db.from("income_activity_log").insert({
        engine: "bounty", action: "submit_ok", status: "ok",
        detail: `Superteam "${title}" — ${contentType} submitted ($${reward} USDC)`,
        metadata: { listingId, slug, submitData },
        user_id: userId,
      });

      submittedCount++;
      results.push({ title, status: "submitted", reward, contentType });

    } catch (e) {
      results.push({ title: wqItem.title, status: "error", error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, submitted: submittedCount, results });
}
