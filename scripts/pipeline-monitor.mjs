import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TYLER = "9133c4a3-2734-4390-b9b8-19ddd4eecb8e";

console.log("=== TLS PIPELINE MONITOR — " + new Date().toLocaleTimeString() + " ===\n");

// Score distribution of discovered items
const { data: disc } = await db.from("income_opportunities")
  .select("score,reward_usd,source,open_prs,title")
  .eq("user_id", TYLER).eq("status", "discovered");

const buckets = { "0-19": 0, "20-39": 0, "40-59": 0, "60-79": 0, "80+": 0, no_score: 0 };
const withReward = (disc ?? []).filter(d => d.reward_usd > 0);
for (const d of disc ?? []) {
  const s = d.score ?? -1;
  if (s < 0) buckets.no_score++;
  else if (s < 20) buckets["0-19"]++;
  else if (s < 40) buckets["20-39"]++;
  else if (s < 60) buckets["40-59"]++;
  else if (s < 80) buckets["60-79"]++;
  else buckets["80+"]++;
}
console.log("DISCOVERED (" + (disc?.length ?? 0) + " total)");
console.log("  Score dist:", JSON.stringify(buckets));
console.log("  With reward>0:", withReward.length, " | No reward:", (disc?.length ?? 0) - withReward.length);
const bySrc = {};
for (const d of disc ?? []) bySrc[d.source] = (bySrc[d.source] ?? 0) + 1;
console.log("  By source:", JSON.stringify(bySrc));

// Top scorers with reward
const top = withReward.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
console.log("\n  Top discovered (reward>0):");
for (const d of top) console.log("    score=" + d.score + " $" + d.reward_usd + " [" + d.source + "] open_prs=" + (d.open_prs ?? "?") + " " + (d.title ?? "").slice(0, 55));

// Would-be queued under current thresholds
const wouldQueue = (disc ?? []).filter(d => {
  const isHighScore = (d.score ?? 0) >= 60 && (d.open_prs ?? 99) < 3 && (d.reward_usd ?? 0) > 0;
  const isKnownRew  = (d.reward_usd ?? 0) >= 20 && (d.score ?? 0) >= 50 && (d.open_prs ?? 99) < 3;
  const isMedRew    = (d.reward_usd ?? 0) >= 50 && (d.score ?? 0) >= 40 && (d.open_prs ?? 99) < 2;
  const isOpire     = d.source === "opire" && (d.score ?? 0) >= 30 && (d.open_prs ?? 99) < 5;
  const isFrantic   = d.source === "frantic" && (d.reward_usd ?? 0) > 0;
  return isHighScore || isKnownRew || isMedRew || isOpire || isFrantic;
});
console.log("\n  Would-queue under current thresholds:", wouldQueue.length);
if (wouldQueue.length > 0) {
  for (const d of wouldQueue.slice(0, 5))
    console.log("    score=" + d.score + " $" + d.reward_usd + " [" + d.source + "] open_prs=" + (d.open_prs ?? "?") + " " + (d.title ?? "").slice(0, 50));
}

// WQ all statuses
const { data: wqAll } = await db.from("income_work_queue")
  .select("id,title,status,expected_usd,pr_url,progress_note,created_at,opportunity_id")
  .eq("user_id", TYLER).order("created_at", { ascending: false }).limit(50);
const wqByStatus = {};
for (const w of wqAll ?? []) wqByStatus[w.status] = (wqByStatus[w.status] ?? 0) + 1;
console.log("\nWORK QUEUE — by status:", JSON.stringify(wqByStatus));

console.log("  In flight (submitted/review):");
for (const w of (wqAll ?? []).filter(w => ["submitted", "review"].includes(w.status)))
  console.log("    $" + w.expected_usd + " " + (w.title ?? "").slice(0, 55) + "\n      note: " + (w.progress_note ?? "").slice(0, 70));

console.log("  Done (recent 5):");
for (const w of (wqAll ?? []).filter(w => w.status === "done").slice(0, 5))
  console.log("    $" + w.expected_usd + " " + (w.title ?? "").slice(0, 55));

console.log("  Failed (recent 5):");
for (const w of (wqAll ?? []).filter(w => w.status === "failed").slice(0, 5))
  console.log("    $" + w.expected_usd + " " + (w.title ?? "").slice(0, 55) + " | " + (w.progress_note ?? "").slice(0, 60));

// Win/loss stats
const doneCount   = (wqAll ?? []).filter(w => w.status === "done").length;
const failedCount = (wqAll ?? []).filter(w => w.status === "failed").length;
const winRate = doneCount + failedCount > 0 ? Math.round(doneCount / (doneCount + failedCount) * 100) : "n/a";
console.log("\n  Win rate (done vs failed):", doneCount, "won /", failedCount, "lost =", winRate + "%");

// Earnings
const { data: earn } = await db.from("income_earnings").select("*").eq("user_id", TYLER).order("earned_date", { ascending: false }).limit(30);
const collected = (earn ?? []).filter(e => e.status === "collected");
const pending   = (earn ?? []).filter(e => e.status === "pending");
const collTotal = collected.reduce((s, e) => s + (e.amount_usd ?? 0), 0);
const pendTotal = pending.reduce((s, e) => s + (e.amount_usd ?? 0), 0);
console.log("\nEARNINGS");
console.log("  Collected:", collected.length, "= $" + collTotal.toFixed(2));
console.log("  Pending (merge not yet confirmed):", pending.length, "= $" + pendTotal.toFixed(2));
if (pending.length > 0) {
  for (const e of pending.slice(0, 5))
    console.log("    $" + e.amount_usd + " [" + e.source + "] " + (e.description ?? "").slice(0, 60));
}

// Source performance: submitted + done by source
const { data: wqFull } = await db.from("income_work_queue")
  .select("status,expected_usd,opportunity_id")
  .eq("user_id", TYLER).in("status", ["submitted", "done", "failed"]);
const { data: opps } = await db.from("income_opportunities")
  .select("id,source").eq("user_id", TYLER);
const oppMap = {};
for (const o of opps ?? []) oppMap[o.id] = o.source;
const srcStats = {};
for (const w of wqFull ?? []) {
  const src = oppMap[w.opportunity_id] ?? "unknown";
  if (!srcStats[src]) srcStats[src] = { submitted: 0, done: 0, failed: 0, usd: 0 };
  srcStats[src][w.status] = (srcStats[src][w.status] ?? 0) + 1;
  if (w.status === "done") srcStats[src].usd += (w.expected_usd ?? 0);
}
console.log("\nSOURCE PERFORMANCE:");
for (const [src, s] of Object.entries(srcStats))
  console.log("  " + src + ": submitted=" + s.submitted + " done=" + s.done + " failed=" + s.failed + " earned=$" + s.usd.toFixed(2));

// Recent activity
const { data: act } = await db.from("income_activity_log")
  .select("action,detail,status,created_at").eq("user_id", TYLER)
  .order("created_at", { ascending: false }).limit(25);
console.log("\nRECENT ACTIVITY (last 25):");
for (const a of act ?? [])
  console.log("  " + (a.created_at ?? "").slice(11, 19) + " [" + a.action + "] " + (a.detail ?? "").slice(0, 90));
