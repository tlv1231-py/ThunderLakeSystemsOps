import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { discoverAllOpportunities } from "@/lib/income/discovery";
import { scoreOpportunity, isAntiTopic, isNonCodeTask } from "@/lib/income/scoring";

// Callable via GET with CRON_SECRET header (cron) or from dashboard (session-auth).
// Finds new opportunities, scores them, upserts into income_opportunities.
export const maxDuration = 60;

// Repos/orgs that post fake, trap, or aggregator bounties — no real payout
const REPO_BLOCKLIST = [
  "bounty-plaza", "bounty-board", "bounty-list", "bounties-list",
  "crypto-bounty", "web3-bounty", "defi-bounty",
  "bountyscout", "bounty-scout", "bug-bounty-list", "bug-bounties",
  "/bug-bounty/",
  // Known bot-trap and research repos
  "bot-trap", "trap-benchmark", "oss-bot-trap",
  // Known fake-bounty operators (cross-post fake issues everywhere)
  "zhangjiayang6835-cyber", "ariahendrawan-sudo",
  // Crypto/DeFi orgs that post huge USDC bounties requiring Solidity expertise
  "ClankerNation", "IES-BoilerRoom", "Roxonn-FutureTech",
  // Stellar blockchain payment apps — bounties pay in XLM/Stellar tokens, not USD
  "ophirpay",
  // Crypto micro-bounty aggregators (RTC, MATIC, SOL tokens — no USD payout)
  "rustchain-bounties", "rustchain", "elyan-labs", "elyanlabs",
  "dsh-bounty", "furongjun",
  // Auto-generated training data / AI-task repos — no real payout mechanism
  "misakanet", "ikalus1988",
  // Micro-bounty personal boards ($1–$10 tasks, mostly already claimed/delivered)
  "frantic-board", "auscaster",
  // Smart contract bounty-escrow repos (Rust/Solana, not our expertise)
  "bounty-escrow", "opensacred-game", "opensacred",
  // Known fake bounty posters (crypto contract tasks on fake repos)
  "mergemint-mint", "Jagadeeshftw",
  // Bounty aggregator notification repos (post "X new opportunities found" issues)
  "freedom-winds", "bountyscout",
  // Fake high-reward non-code missions (in-person repair work, not software)
  "ledgercorp",
  // Crypto blockchain SDK (pays in JNZ tokens, not USD)
  "janzeerorg",
  // Auto-generated astronomy data QA issues (not software bounties)
  "jwst-gc",
  // Police/surveillance intel system (Chinese, non-code, $null)
  "taichung-police-intel",
  // CAPTCHA bypass projects (prohibited by safety rules)
  "UdioWrapper",
  // Karma-only bounty projects (no USD payout)
  "privacy-the-game", "lizTheDeveloper",
];

// Extended non-code title patterns
const NON_CODE_TITLE_PATTERNS = [
  /\bpoem\b/i, /\bcontent creation\b/i, /\bwrite a\b/i, /\bgenerate text\b/i,
  /\blogo\b/i, /\bdesign\b.*\bmockup\b/i, /\bartwork\b/i,
  /\btweet\b/i, /\bblog post\b/i, /\bcopywriting\b/i,
  /\bgenerate.*content\b/i, /\bcreative writing\b/i,
  /\btutorial\b/i, /\bavailability inquiry\b/i, /\bpayment inquiry\b/i,
  /\bopen bounties right now\b/i, /\bbounty discovery\b/i,
  /\bbounty scout\b/i, /\bbounty report\b/i, /\bbounty tracker\b/i,
  /\blist \d+ \w/i, /^order-\d+/i, /atm phase/i,
  // Meta-bounty aggregator issues (the issue itself is a bounty list, not a code task)
  /bounty.{0,20}alert/i, /new.{0,20}bounti/i, /\d+\s+new.*bounti/i,
  /bounti.*found/i, /list.*bounti/i,
  // Trap/meta-question issues
  /^why did you/i, /^why are you/i, /^who are you/i, /^are you an ai/i,
  /\[micro-bounty\]/i, /micro.{0,5}bounty/i,
  // Crypto-token rewards (not USD — no real payout path)
  /\d+(\.\d+)?\s+(rtc|matic|sol|eth|btc|usdc|usdt)\b/i,
  // Fake bounty coordinator spam accounts
  /bountycoordinator/i,
  // Maths/data bounties (financial data analysis, not code)
  /\bmaths bounty\b/i,
  // Stellar blockchain bounty programs (pay in XLM, not USD)
  /stellar drips/i, /stellar.*bounty/i,
  // formatStellarAmount and similar Stellar-chain function names in titles
  /stellar.{0,2}amount/i,
  // AI-generated task runners posting fake issues (Jules AI task executor)
  /\[jules task\b/i, /jules task from/i,
  // Meta-intake/triage tickets (not actionable code tasks)
  /^\[intake\]/i, /^\[question\]/i,
  // Open bounties aggregator posts
  /\d+\s+open bounties/i, /📋.*bounti/i,
  // AI-generated spam issues posted to fake forks (uniform emoji prefix pattern)
  /^🎯\s/,
  // Renovate bot auto-generated dependency dashboard (not a code task)
  /^dependency dashboard$/i,
  // Sponsor/ecosystem invitation spam
  /^invitation:/i, /connect your .{0,20} users to/i,
  // Non-English-only titles (single CJK word, Arabic, etc.) — not actionable
  /^[一-鿿぀-ヿ؀-ۿ]{1,6}$/,
  // Blockchain Drips funding requests
  /^\[drips\]/i,
  // "Proposal for discussion" meta-issues
  /^proposal for discussion:/i,
  // Figma design tasks (require Figma account, not pure code work)
  /^figma\s*:/i, /from\s+the\s+figma\b/i,
  // Research / investigation tasks (non-code, human-driven)
  /^(?:market|launch|language|user|community)\s+research\s*:/i,
  // Marketing / community non-code tasks
  /^(?:sales|launch|marketing|community)\s+kit\s*:/i,
  /^community\s+set-?up\s*:/i,
  // "First-Dollar Mission" style non-code challenges (in-person or business tasks)
  /^first-dollar\s+mission/i,
  // CAPTCHA/bot-bypass tasks (prohibited by safety rules)
  /\bhcaptcha\b/i, /\bcaptcha.{0,10}bypass\b/i, /\bsolve.{0,10}captcha\b/i,
  // Police/surveillance/military intelligence systems
  /\bpolice.{0,15}(intel|data|system)\b/i, /\b(排程|公安|警察)\b/,
  // Privacy opt-out/broker check tasks (require human browser research, not code)
  /^\[opt-?out\s+check\]/i, /\bopt.?out\s+route\b/i,
  // Data broker verification tasks
  /\bdata\s+broker.{0,20}confirm\b/i, /\bconfirm.{0,20}opt.?out\b/i,
  // Karma-only bounties (no USD payout)
  /paid\s+in\s+karma/i, /karma\s+points?\s+only/i,
];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    if (auth !== null) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createAdminClient() as any;

  let userId: string | null = null;
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    userId = user?.id ?? null;
  } catch {}
  if (!userId) {
    userId = process.env.INCOME_AGENT_USER_ID ?? null;
  }
  if (!userId) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1 });
    userId = users?.users?.[0]?.id ?? null;
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const guardWindow = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  const { data: recentScan } = await db
    .from("income_activity_log")
    .select("created_at")
    .eq("user_id", userId)
    .eq("action", "scan_start")
    .gt("created_at", guardWindow)
    .limit(1)
    .maybeSingle();
  if (recentScan) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_within_12m" });
  }

  const startMs = Date.now();

  // ── Retroactive queue cleanup ─────────────────────────────────────────────
  // On every scan, sweep the existing queue and dismiss any items that match
  // the current blocklist/anti-topic filters. Catches items queued before
  // filter logic existed and removes stale anti-fit targets automatically.
  let cleanedCount = 0;
  try {
    const { data: activeQueue } = await db
      .from("income_opportunities")
      .select("id, title, repo_url, url, description, language, tags")
      // No user_id filter — cleanup must run for cron scans (userId=null) too
      .in("status", ["queued", "discovered"])
      .limit(200);

    if (activeQueue?.length) {
      const toClean = (activeQueue as any[]).filter(item => {
        const repoLow = ((item.repo_url ?? "") + (item.url ?? "")).toLowerCase();
        const isBlocklisted = REPO_BLOCKLIST.some(p => repoLow.includes(p));
        const isTitleNonCode = NON_CODE_TITLE_PATTERNS.some(p => p.test(item.title ?? ""));
        const isAntiTopicItem = isAntiTopic({
          title: item.title, description: item.description,
          tags: item.tags, language: item.language,
          source: "github", external_id: item.id,
        } as any);
        const isNonCodeItem = isNonCodeTask({
          title: item.title, description: item.description,
          tags: item.tags, language: item.language,
          source: "github", external_id: item.id,
        } as any);
        return isBlocklisted || isTitleNonCode || isAntiTopicItem || isNonCodeItem;
      });

      if (toClean.length > 0) {
        const ids = toClean.map((i: any) => i.id);
        await db.from("income_opportunities")
          .update({ status: "dismissed" })
          .in("id", ids);
        cleanedCount = toClean.length;
      }
    }
  } catch {}

  // ── Re-queue sweep: promote discovered→queued if eligible and no active WQ entry ──
  // Runs every scan so improvements to the scorer automatically promote good items.
  // Dual threshold: score>=60 (quality) OR reward>=$20+score>=50 (confirmed money).
  let requeueCount = 0;
  try {
    const { data: highScored } = await db
      .from("income_opportunities")
      .select("id, title, description, score, reward_usd, estimated_hours, repo_url, open_prs, source")
      .eq("user_id", userId)
      .in("status", ["discovered", "queued"])
      .gte("score", 50)
      .lt("open_prs", 6)
      .limit(50);

    if (highScored?.length) {
      for (const opp of highScored as any[]) {
        // Apply same dual threshold as auto-queue (reward_usd > 0 required for high-score path)
        const sweepHighScore  = opp.score >= 60 && (opp.open_prs ?? 0) < 3 && (opp.reward_usd ?? 0) > 0;
        const sweepKnownRew   = (opp.reward_usd ?? 0) >= 20 && opp.score >= 50 && (opp.open_prs ?? 0) < 3;
        const sweepOpireReady = opp.source === "opire" && opp.score >= 35 && (opp.open_prs ?? 0) < 5;
        if (!sweepHighScore && !sweepKnownRew && !sweepOpireReady) continue;

        const { data: existingWQ } = await db
          .from("income_work_queue")
          .select("id")
          .eq("opportunity_id", opp.id)
          .eq("user_id", userId)
          .in("status", ["pending", "in_progress"])
          .maybeSingle();

        if (!existingWQ) {
          await db.from("income_opportunities").update({ status: "queued" }).eq("id", opp.id).eq("user_id", userId);
          await db.from("income_work_queue").insert({
            engine:            "bounty",
            title:             opp.title,
            description:       opp.description,
            status:            "pending",
            priority:          opp.score >= 85 ? 1 : opp.score >= 70 ? 2 : 3,
            expected_usd:      opp.reward_usd,
            estimated_hours:   opp.estimated_hours,
            opportunity_id:    opp.id,
            repo_url:          opp.repo_url,
            requires_approval: false,
            progress_note:     `Re-queued from sweep (score ${opp.score}, $${opp.reward_usd ?? 0})`,
            progress_pct:      0,
            user_id:           userId,
          });
          requeueCount++;
        }
      }
    }
  } catch {}

  // ── Log scan start ─────────────────────────────────────────────────────────
  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "scan_start",
    detail:  `Discovery scan starting — querying opire, github${cleanedCount > 0 ? ` (swept ${cleanedCount} stale items)` : ""}${requeueCount > 0 ? ` (re-queued ${requeueCount})` : ""}`,
    status:  "ok",
    user_id: userId,
  });

  // ── Run discovery ──────────────────────────────────────────────────────────
  const { opportunities, log } = await discoverAllOpportunities({ onSourceComplete: async (source, count, err) => {
    await db.from("income_activity_log").insert({
      engine:  "bounty",
      action:  "scan_source",
      detail:  err
        ? `${source.toUpperCase()}: error — ${err}`
        : `${source.toUpperCase()}: found ${count} bount${count === 1 ? "y" : "ies"}`,
      status:  err ? "warning" : "ok",
      metadata: { source, count },
      user_id:  userId,
    });
  }});

  let newCount  = 0;
  let skipCount = 0;

  for (const opp of opportunities) {
    if (!opp.external_id) continue;

    // ── Hard filters: skip before touching the DB ─────────────────────────
    const repoLower = (opp.repo_url ?? opp.url ?? "").toLowerCase();
    if (REPO_BLOCKLIST.some(p => repoLower.includes(p))) { skipCount++; continue; }
    if (NON_CODE_TITLE_PATTERNS.some(p => p.test(opp.title ?? ""))) { skipCount++; continue; }
    // Already-claimed/delivered bounties — labels tell us the bounty is closed
    const tagLower = (opp.tags ?? []).map(t => t.toLowerCase());
    if (["delivered", "claimed", "paid", "completed", "accepted"].some(t => tagLower.includes(t))) { skipCount++; continue; }
    // Description-level crypto signals: wallet addresses or USDC/crypto payout mentions
    const descLower = (opp.description ?? "").toLowerCase();
    if (/0x[0-9a-f]{40}/.test(descLower) || /\busdc payout\b/.test(descLower) || /base usdc/.test(descLower) || /\bpayout address\b/.test(descLower)) { skipCount++; continue; }
    if (isAntiTopic(opp)) { skipCount++; continue; }
    if (isNonCodeTask(opp)) { skipCount++; continue; }

    // Check if already tracked
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
      ...(existing ? {} : { status: "discovered" }),
    };

    if (existing) {
      await db.from("income_opportunities").update(record).eq("id", existing.id);
    } else {
      const { data: inserted } = await db.from("income_opportunities")
        .insert({ ...record, status: "discovered" })
        .select("id").single();
      newCount++;

      // Auto-queue: score >= 60 with known reward (profitability-first) OR reward >= $20 with score >= 50
      // Require reward_usd > 0 for GitHub — prevents $0 issues from clogging the queue
      // Opire/Algora: allow up to 5 open PRs (merge-based payment reliable even with competition)
      const isHighScore = score >= 60 && (opp.open_prs ?? 0) < 3 && (opp.reward_usd ?? 0) > 0;
      const isKnownReward = (opp.reward_usd ?? 0) >= 20 && score >= 50 && (opp.open_prs ?? 0) < 3;
      const isOpireReady = opp.source === "opire" && score >= 35 && (opp.open_prs ?? 0) < 5;
      if ((isHighScore || isKnownReward || isOpireReady) && inserted && userId) {
        await db.from("income_opportunities").update({ status: "queued" }).eq("id", inserted.id);
        await db.from("income_work_queue").insert({
          engine:            "bounty",
          title:             opp.title,
          description:       opp.description,
          status:            "pending",
          priority:          score >= 80 ? 1 : score >= 65 ? 2 : 3,
          expected_usd:      opp.reward_usd,
          estimated_hours:   estimated_hours,
          opportunity_id:    inserted.id,
          repo_url:          opp.repo_url,
          requires_approval: false,
          progress_note:     `Auto-queued (score ${score}, $${opp.reward_usd ?? 0}) — waiting for agent`,
          progress_pct:      0,
          user_id:           userId,
        });
      }
    }
  }

  const durationMs = Date.now() - startMs;

  await db.from("income_activity_log").insert({
    engine:  "bounty",
    action:  "discovery_run",
    detail:  `Found ${opportunities.length} bounties (${newCount} new, ${skipCount} skipped${cleanedCount > 0 ? `, ${cleanedCount} swept` : ""})`,
    status:  "ok",
    metadata: { log, duration_ms: durationMs, sources: log.map(l => l.source) },
    user_id:  userId,
  });

  return NextResponse.json({
    ok:       true,
    total:    opportunities.length,
    new:      newCount,
    skipped:  skipCount,
    cleaned:  cleanedCount,
    duration: durationMs,
    sources:  log,
  });
}
