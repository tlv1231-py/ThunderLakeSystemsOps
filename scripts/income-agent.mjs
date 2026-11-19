#!/usr/bin/env node
/**
 * TLS Income Agent
 * Reads queued bounties from Supabase, works each one with Claude Code, opens PRs.
 *
 * Usage:
 *   node scripts/income-agent.mjs
 *
 * Requirements:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - gh CLI authenticated (gh auth login)
 *   - git configured with your GitHub identity
 *   - claude CLI available (npx claude or global install)
 */

import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { createClient } from "@supabase/supabase-js";

// ── Load env ──────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, "..");
const envPath = join(ROOT, ".env.local");
if (!existsSync(envPath)) {
  console.error("❌  .env.local not found. Run from the project root.");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

// Repos/patterns known to be fake bounty aggregators or scam listings
const REPO_BLOCKLIST = [
  "bounty-plaza", "bounty-board", "bounty-list", "bounties-list",
  "crypto-bounty", "web3-bounty", "defi-bounty",
];

const SUPABASE_URL      = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY      = env.SUPABASE_SERVICE_ROLE_KEY;
const GITHUB_TOKEN      = env.GITHUB_TOKEN ?? "";
const WORKDIR           = join(tmpdir(), "tls-agent");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
}

async function progress(id, pct, note) {
  process.stdout.write(`  [${String(pct).padStart(3)}%] ${note}\n`);
  await db.from("income_work_queue").update({
    progress_pct: pct,
    progress_note: note,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

async function log(userId, action, detail, status = "ok") {
  await db.from("income_activity_log").insert({
    engine: "bounty", action, detail, status, user_id: userId,
  });
}

// ── Fetch queued items ────────────────────────────────────────────────────────
const { data: queuedItems, error: qErr } = await db
  .from("income_work_queue")
  .select("*, income_opportunities(*)")
  .eq("status", "pending")
  .order("priority")
  .limit(5);

if (qErr) { console.error("❌  DB error:", qErr.message); process.exit(1); }
if (!queuedItems?.length) {
  console.log("📭  Queue empty — run a discovery scan or wait for the hourly cron.");
  process.exit(0);
}

console.log(`\n🎯  TLS Income Agent — ${queuedItems.length} bounties queued\n${"─".repeat(60)}`);

// ── Work through each item ────────────────────────────────────────────────────
for (const item of queuedItems) {
  const opp = item.income_opportunities;
  if (!opp) {
    console.log(`⚠  Work item ${item.id} has no linked opportunity — skipping`);
    continue;
  }

  // Skip fake bounty aggregator repos
  const repoLower = (opp.repo_url ?? opp.url ?? "").toLowerCase();
  if (REPO_BLOCKLIST.some(p => repoLower.includes(p))) {
    console.log(`  🚫  Blocked repo pattern — skipping`);
    await db.from("income_work_queue").update({ status: "failed", progress_note: "Blocked: fake bounty aggregator repo" }).eq("id", item.id);
    await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", opp.id);
    continue;
  }

  // Skip items with no monetary reward — not worth agent time
  if (!opp.reward_usd || opp.reward_usd <= 0) {
    console.log(`  ⚠  No reward attached — skipping`);
    await db.from("income_work_queue").update({ status: "failed", progress_note: "No reward_usd — skipped" }).eq("id", item.id);
    continue;
  }

  const userId     = item.user_id;
  const workId     = item.id;
  const repoUrl    = opp.repo_url ?? opp.url?.replace(/\/issues\/\d+$/, "") ?? null;
  const issueUrl   = opp.url;
  const issueTitle = opp.title;
  const issueBody  = opp.description ?? "";

  console.log(`\n▶  ${issueTitle}`);
  console.log(`   ${formatMoney(opp.reward_usd)} · score ${opp.score} · ${opp.source}`);
  console.log(`   ${issueUrl}\n`);

  // Mark in-progress
  await db.from("income_work_queue").update({
    status: "in_progress",
    started_at: new Date().toISOString(),
  }).eq("id", workId);

  await db.from("income_opportunities").update({
    status: "in_progress",
  }).eq("id", opp.id);

  try {
    // ── 1. Resolve repo ───────────────────────────────────────────────────────
    await progress(workId, 5, "Resolving repository…");

    let ghRepo = repoUrl
      ? repoUrl.replace("https://github.com/", "").replace(/\.git$/, "").replace(/\/$/, "")
      : null;

    if (!ghRepo) {
      await progress(workId, 0, "Could not determine repo URL — skipping");
      await db.from("income_work_queue").update({ status: "failed" }).eq("id", workId);
      await log(userId, "agent_skip", `No repo URL for: ${issueTitle}`, "warning");
      continue;
    }

    // ── 1b. Verify repo has content ───────────────────────────────────────────
    await progress(workId, 8, "Checking repo has commits…");
    try {
      const repoMeta = JSON.parse(run(`gh api repos/${ghRepo} --jq '{size:.size}'`));
      if (!repoMeta.size || repoMeta.size === 0) {
        await progress(workId, 0, "Repo is empty — no code to fix");
        await db.from("income_work_queue").update({ status: "failed" }).eq("id", workId);
        await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", opp.id);
        await log(userId, "agent_skip", `Empty repo: ${ghRepo}`, "warning");
        continue;
      }
    } catch {}

    // ── 2. Fork repo ──────────────────────────────────────────────────────────
    await progress(workId, 10, `Forking ${ghRepo}…`);

    let forkRepo = null;
    try {
      const ghUser = run("gh api user --jq .login");
      forkRepo = `${ghUser}/${ghRepo.split("/")[1]}`;

      // Check if fork already exists
      try { run(`gh api repos/${forkRepo} --silent`); }
      catch {
        run(`gh api repos/${ghRepo}/forks -X POST --silent`);
        // Wait for fork to be ready
        await sleep(4000);
      }
    } catch (e) {
      await progress(workId, 0, `Fork failed — cannot proceed without push access`);
      await db.from("income_work_queue").update({ status: "failed" }).eq("id", workId);
      await log(userId, "agent_skip", `Fork failed for: ${issueTitle}`, "warning");
      continue;
    }

    // ── 3. Clone ──────────────────────────────────────────────────────────────
    await progress(workId, 20, `Cloning ${forkRepo}…`);

    mkdirSync(WORKDIR, { recursive: true });
    const repoName  = ghRepo.split("/")[1];
    const cloneDir  = join(WORKDIR, `${repoName}-${Date.now()}`);

    run(`gh repo clone ${forkRepo} "${cloneDir}" -- --depth=50 --quiet`);

    // Override remote URL to use token directly (avoids Windows credential store mismatch)
    if (GITHUB_TOKEN) {
      run(`git remote set-url origin https://${GITHUB_TOKEN}@github.com/${forkRepo}.git`, { cwd: cloneDir });
    }

    // gh repo clone sets upstream automatically when cloning a fork — skip if already set
    try { run(`git remote add upstream https://github.com/${ghRepo}.git`, { cwd: cloneDir }); } catch {}

    // ── 4. Create branch ──────────────────────────────────────────────────────
    await progress(workId, 30, "Creating fix branch…");

    const issueNum  = issueUrl.match(/\/issues\/(\d+)/)?.[1] ?? Date.now();
    const branchName = `fix/bounty-${issueNum}`;

    run(`git checkout -b ${branchName}`, { cwd: cloneDir });

    await db.from("income_work_queue").update({ branch_name: branchName }).eq("id", workId);

    // ── 4b. Claim the bounty on the platform (Opire, Algora, etc.) ───────────
    await progress(workId, 32, "Claiming bounty…");
    try {
      // Post /opire try to claim the issue (Opire platform — payment on merge)
      run(`gh api repos/${ghRepo}/issues/${issueNum}/comments -X POST -f body="/opire try"`);
    } catch {}

    // ── 5. Fetch issue details ────────────────────────────────────────────────
    await progress(workId, 35, "Fetching full issue details…");

    let fullIssueBody = issueBody;
    try {
      const issueData = JSON.parse(run(`gh api repos/${ghRepo}/issues/${issueNum}`));
      fullIssueBody = issueData.body ?? issueBody;
    } catch {}

    // ── 6. Write task brief ───────────────────────────────────────────────────
    await progress(workId, 40, "Preparing task brief for Claude…");

    const brief = `# Bounty Fix

**Reward:** ${formatMoney(opp.reward_usd)}
**Issue:** ${issueUrl}
**Repo:** https://github.com/${ghRepo}

---

## Issue

${issueTitle}

${fullIssueBody}

---

## Process

### 1. Orient yourself first
Before touching any code:
- Read the README and any relevant docs
- Run: find . -type f | grep -v node_modules | grep -v .git | grep -v dist | head -60
- Grep for the key terms from the issue title to find the relevant files
- Read the files around the bug — understand what's currently happening

### 2. Find and read the tests
- Look for test files near the relevant code (*.test.ts, *.spec.js, __tests__, etc.)
- Read them — they tell you what behavior is expected
- Understand what a passing fix looks like before writing a line

### 3. Implement the fix
- Make the MINIMAL change that fixes the issue — nothing more
- Do not refactor, rename, reorganize, or clean up unrelated code
- Do not add dependencies unless the issue explicitly requires it
- Do not modify config files (package.json, tsconfig.json, etc.) unless that IS the fix
- One logical change, one commit

### 4. Verify
- Run the test suite: check package.json scripts for "test", "lint", "typecheck"
  Common commands: npm test, yarn test, pnpm test, pytest, go test ./..., cargo test
- If TypeScript is present: npx tsc --noEmit
- Fix any test failures your change caused — if a test was wrong before, update it

### 5. Commit and document
- git add -A
- git commit -m "fix: ${issueTitle.slice(0, 72).replace(/`/g, "'")}"
- Write AGENT_SUMMARY.md with:
  - Root cause: what was wrong and why
  - Fix: what you changed and the reasoning
  - Verification: how to confirm it works
  - Concerns: anything a reviewer should know

---

## Stop conditions

If ANY of these are true, write "UNCERTAIN: [reason]" at the top of AGENT_SUMMARY.md, make NO code changes, and stop:
- The fix requires changing more than ~5 files
- You cannot determine what the correct behavior should be
- The issue requires a database migration, API key, or external service
- You find 3+ open PRs already attempting this fix (high competition)
- The repo is not in a language/framework you can reason about confidently

A clean UNCERTAIN is better than a bad PR.
`;

    writeFileSync(join(cloneDir, "BOUNTY_TASK.md"), brief);

    // ── 7. Run Claude Code ────────────────────────────────────────────────────
    await progress(workId, 50, "Running Claude Code on the fix…");

    const claudePrompt = `Read BOUNTY_TASK.md carefully, then complete the fix. Follow the process in the file step by step. Do not skip orientation or verification. Write AGENT_SUMMARY.md when done.`;

    let claudeOutput = "";
    try {
      claudeOutput = run(
        `claude --dangerously-skip-permissions --print "${claudePrompt.replace(/"/g, '\\"')}"`,
        { cwd: cloneDir, timeout: 600_000 }
      );
    } catch (e) {
      claudeOutput = String(e);
    }

    // Store log
    await db.from("income_work_queue").update({
      agent_log: claudeOutput.slice(-4000),
    }).eq("id", workId);

    // Check if Claude made real changes — exclude BOUNTY_TASK.md which we wrote ourselves
    const diffStat = run("git status --porcelain", { cwd: cloneDir });
    const realChanges = diffStat.split("\n").filter(l => l.trim() && !l.includes("BOUNTY_TASK.md")).join("\n");
    const hasChanges = realChanges.trim().length > 0;

    // Check for summary
    const summaryPath = join(cloneDir, "AGENT_SUMMARY.md");
    const summary = existsSync(summaryPath)
      ? readFileSync(summaryPath, "utf8").trim()
      : "";

    if (!hasChanges) {
      await progress(workId, 0, `Claude made no changes — ${summary.slice(0, 120)}`);
      await db.from("income_work_queue").update({ status: "failed" }).eq("id", workId);
      await log(userId, "agent_no_changes", issueTitle, "warning");
      rmSync(cloneDir, { recursive: true, force: true });
      continue;
    }

    // ── 8. Commit ─────────────────────────────────────────────────────────────
    await progress(workId, 75, "Committing fix…");

    run("git add -A", { cwd: cloneDir });
    run(`git commit -m "fix: ${issueTitle.slice(0, 72).replace(/"/g, "'")}"`, { cwd: cloneDir });

    // ── 9. Push ───────────────────────────────────────────────────────────────
    await progress(workId, 85, "Pushing branch…");

    run(`git push origin ${branchName} --force-with-lease`, { cwd: cloneDir });

    // ── 10. Open PR ───────────────────────────────────────────────────────────
    await progress(workId, 92, "Opening pull request…");

    const prBody = [
      "## Summary",
      "",
      summary || "See changes.",
      "",
      "## Changes",
      "",
      summary
        .split("\n")
        .filter(l => l.trim())
        .slice(0, 4)
        .map(l => `- ${l.replace(/^[-*•]\s*/, "")}`)
        .join("\n"),
      "",
      `Closes #${issueNum}`,
    ].join("\n");

    let prUrl  = "";
    let prNum  = null;
    try {
      const prOut = run(
        `gh pr create --repo ${ghRepo} --head ${forkRepo !== ghRepo ? `${forkRepo.split("/")[0]}:${branchName}` : branchName} --title "${issueTitle.slice(0, 100).replace(/"/g, "'")}" --body "${prBody.replace(/"/g, "'").replace(/\n/g, "\\n")}"`,
        { cwd: cloneDir }
      );
      prUrl = prOut.match(/https:\/\/github\.com\/[^\s]+/)?.[0] ?? "";
      prNum = parseInt(prUrl.split("/").pop() ?? "0") || null;
    } catch (e) {
      await progress(workId, 85, `PR creation failed: ${String(e).slice(0, 100)}`);
    }

    // ── 11. Update DB ─────────────────────────────────────────────────────────
    await db.from("income_work_queue").update({
      status:       prUrl ? "submitted" : "review",
      progress_pct: 100,
      progress_note: prUrl ? `PR opened: ${prUrl}` : "Fix committed — PR creation failed, check logs",
      pr_url:        prUrl || null,
      pr_number:     prNum,
      repo_url:      `https://github.com/${ghRepo}`,
      completed_at:  new Date().toISOString(),
    }).eq("id", workId);

    await db.from("income_opportunities").update({
      status: prUrl ? "submitted" : "in_progress",
    }).eq("id", opp.id);

    // No approval record — pipeline is fully autonomous. Monitor the board directly.

    await log(userId, "agent_pr_opened", `${issueTitle} → ${prUrl || "no PR"}`, prUrl ? "ok" : "warning");

    console.log(`  ✓  PR: ${prUrl || "failed"}`);
    console.log(`  📝  ${summary.slice(0, 100)}`);

    // Cleanup
    rmSync(cloneDir, { recursive: true, force: true });

  } catch (err) {
    console.error(`  ✗  Error: ${err.message}`);
    await db.from("income_work_queue").update({
      status: "failed",
      progress_note: `Error: ${String(err).slice(0, 200)}`,
      agent_log: String(err),
    }).eq("id", workId);
    await log(userId, "agent_error", String(err).slice(0, 200), "error");
  }
}

console.log(`\n${"─".repeat(60)}\n✅  Agent run complete — check the Pipeline tab in TLS Ops\n`);
process.exit(0);

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatMoney(n) {
  if (!n) return "—";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
