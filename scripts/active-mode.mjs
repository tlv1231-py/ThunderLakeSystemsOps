#!/usr/bin/env node
/**
 * TLS Active Mode
 * Runs discovery + agent in a continuous loop while you're at the computer.
 * Respects all rate limits. Stop with Ctrl+C.
 *
 * Usage:
 *   node scripts/active-mode.mjs
 */

import { execSync, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────
const DISCOVERY_INTERVAL_MS  = 15 * 60 * 1000;  // 15 min — safe within GitHub search limits
const MIN_AGENT_INTERVAL_MS  =  5 * 60 * 1000;  // 5 min cooldown between agent runs
const APP_URL = "https://thunder-lake-systems-ops.vercel.app";

// ── Load env ──────────────────────────────────────────────────────────────────
const ROOT    = resolve(import.meta.dirname, "..");
const envPath = join(ROOT, ".env.local");
if (!existsSync(envPath)) { console.error("❌  .env.local not found"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]; })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── State ─────────────────────────────────────────────────────────────────────
let lastAgentRun     = 0;
let lastDiscovery    = 0;
let totalNewBounties = 0;
let totalPRs         = 0;
let cycleCount       = 0;

function ts() { return new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", second:"2-digit" }); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }
function hr() { console.log("─".repeat(60)); }

// ── Discovery ─────────────────────────────────────────────────────────────────
async function runDiscovery() {
  log("🔍  Running discovery…");
  try {
    const res  = await fetch(`${APP_URL}/api/income/discover`, { signal: AbortSignal.timeout(90_000) });
    const data = await res.json();
    if (data.ok) {
      totalNewBounties += data.new ?? 0;
      log(`✓  Discovery: ${data.total} found, ${data.new} new, ${data.skipped} skipped (${data.duration}ms)`);
      return data.new ?? 0;
    } else {
      log(`⚠  Discovery returned: ${JSON.stringify(data)}`);
      return 0;
    }
  } catch (e) {
    log(`✗  Discovery failed: ${e.message}`);
    return 0;
  }
}

// ── Queue check ───────────────────────────────────────────────────────────────
async function getPendingCount() {
  const { count } = await db.from("income_work_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

// ── Agent ─────────────────────────────────────────────────────────────────────
function runAgent() {
  return new Promise((resolve) => {
    log("🤖  Launching agent…");
    lastAgentRun = Date.now();
    const proc = spawn("node", ["scripts/income-agent.mjs"], {
      cwd: ROOT, stdio: "inherit",
    });
    proc.on("close", code => {
      if (code === 0) { log("✓  Agent run complete"); totalPRs++; }
      else            { log(`⚠  Agent exited with code ${code}`); }
      resolve();
    });
  });
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick() {
  cycleCount++;
  hr();
  log(`⚡  Active Mode — cycle ${cycleCount} | ${totalNewBounties} new bounties | ~${totalPRs} PRs this session`);

  const now = Date.now();
  let newFound = 0;

  // Run discovery if interval has passed
  if (now - lastDiscovery >= DISCOVERY_INTERVAL_MS) {
    newFound = await runDiscovery();
    lastDiscovery = Date.now();
  } else {
    const nextIn = Math.round((DISCOVERY_INTERVAL_MS - (now - lastDiscovery)) / 1000 / 60);
    log(`⏳  Next discovery in ~${nextIn} min`);
  }

  // Run agent if there are pending items and cooldown has passed
  const pending = await getPendingCount();
  const cooldownOk = (now - lastAgentRun) >= MIN_AGENT_INTERVAL_MS;

  if (pending > 0 && cooldownOk) {
    log(`📋  ${pending} items in queue — starting agent`);
    await runAgent();
  } else if (pending > 0) {
    const cooldownLeft = Math.round((MIN_AGENT_INTERVAL_MS - (now - lastAgentRun)) / 1000);
    log(`⏳  ${pending} queued — agent cooldown ${cooldownLeft}s remaining`);
  } else {
    log(`📭  Queue empty — waiting for discovery`);
  }
}

async function main() {
  console.clear();
  hr();
  console.log("⚡  TLS ACTIVE MODE");
  console.log(`    Discovery: every 15 min`);
  console.log(`    Agent:     on new items (5 min cooldown)`);
  console.log(`    Stop:      Ctrl+C`);
  hr();

  // Run immediately on start
  lastDiscovery = 0;
  await tick();

  // Then loop every 60 seconds (checks whether intervals have elapsed)
  const interval = setInterval(tick, 60_000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    hr();
    log(`🛑  Active Mode stopped — ${totalNewBounties} new bounties found, ~${totalPRs} PRs submitted this session`);
    process.exit(0);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
