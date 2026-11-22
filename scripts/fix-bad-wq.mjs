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

// 1. Get all in-flight work queue items
const { data: wqItems } = await db.from("income_work_queue")
  .select("id,title,status,expected_usd,pr_url,progress_note,opportunity_id")
  .eq("user_id", TYLER)
  .in("status", ["submitted", "review"]);

console.log("In-flight items:", wqItems?.length ?? 0);

const BAD_PATTERNS = [
  // Job listings
  /new\s+grad/i, /founding\s+\d+/i, /software\s+engineer\s+job/i,
  /entry.?level\s+(engineer|developer)/i, /hiring\s+for/i,
  // AoC / competitive programming
  /aoc\s+20\d\d/i, /advent\s+of\s+code/i, /lateralus/i,
  // WordPress/WooCommerce deployment
  /woocommerce/i, /dank\s+mush/i,
  // Fix committed but PR failed
  /fix\s+committed.*PR\s+creation\s+failed/i,
];

const toFail = [];
for (const item of (wqItems ?? [])) {
  const title = item.title ?? "";
  const note  = item.progress_note ?? "";
  const isBad = BAD_PATTERNS.some(p => p.test(title)) || /fix\s+committed.*PR\s+creation\s+failed/i.test(note);
  if (isBad) {
    toFail.push(item);
    console.log("  MARKING FAILED:", item.title?.slice(0, 70), "| note:", note?.slice(0, 50));
  }
}

if (toFail.length > 0) {
  for (const item of toFail) {
    const reason = /fix\s+committed.*PR\s+creation\s+failed/i.test(item.progress_note ?? "")
      ? "PR creation failed — no open PR"
      : "Out of scope: filtered pattern (job/AoC/deploy)";
    await db.from("income_work_queue").update({ status: "failed", progress_note: reason }).eq("id", item.id);
    if (item.opportunity_id) {
      await db.from("income_opportunities").update({ status: "rejected" }).eq("id", item.opportunity_id);
    }
    await db.from("income_activity_log").insert({
      engine: "bounty", action: "pr_closed",
      detail: `Auto-cleaned: "${(item.title ?? "").slice(0, 80)}" — ${reason}`,
      status: "warning", user_id: TYLER,
    });
  }
  console.log("Fixed", toFail.length, "bad in-flight items.");
} else {
  console.log("No bad items found.");
}

// 2. Dismiss the Hebrew fake item ($96k bot-status fake)
const { data: fakeItems } = await db.from("income_opportunities")
  .select("id,title,reward_usd,score,status")
  .eq("user_id", TYLER)
  .eq("status", "discovered");

const fakeItem = (fakeItems ?? []).find(d => /[֐-׿]{3,}/.test(d.title ?? "") || (d.reward_usd > 50000));
if (fakeItem) {
  console.log("\nDismissing fake item:", fakeItem.title?.slice(0, 60), "reward=$" + fakeItem.reward_usd);
  await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", fakeItem.id);
  console.log("Dismissed.");
} else {
  console.log("\nNo obvious fake high-reward items found.");
}

// 3. Report final state
const { data: wqFinal } = await db.from("income_work_queue")
  .select("status").eq("user_id", TYLER).in("status", ["submitted", "review", "pending"]);
const byStatus = {};
for (const w of wqFinal ?? []) byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
console.log("\nFinal in-flight:", JSON.stringify(byStatus));
