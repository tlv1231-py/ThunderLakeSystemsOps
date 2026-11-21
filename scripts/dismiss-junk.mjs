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

// IDs to dismiss (confirmed non-code or fake bounty aggregators)
const toDismiss = [
  // BountyScout aggregator notifications (freedom-winds repo)
  "e33d4edf-a025-42ad-847d-9363879541ad",  // 🎯 Bounty Alert: 13 New Opportunityies found
  "0482a48a-7eae-451a-bf96-df20b25c2ef6",  // 🎯 Bounty Alert: 14 New Opportunityies found
  // Non-code/marketing/meta tasks
  "bd34ef5a-0c83-4a8b-8b7c-383e67d877db",  // Internal: update the website's bounty section
  "b1d21b03-8683-4798-be2e-dc924b5d2b55",  // Sales kit: owner pitch and pricing page
  "3657c890-1190-4fad-a840-589789708b8c",  // Community set-up: Discord and weekly updates
  "10456ae8-8c18-4c18-8e13-dd6c91195f3d",  // Launch kit: posts, 60-second video and 20 communities
  "2d025524-cf9d-4ae7-8d99-d1282e60dc8c",  // Launch research: video costs, country and niche
  "736bbaf8-f8d4-4d87-857f-e78dc235db80",  // Market research: pilot city, 3 owner interviews
  "5d6630b4-93a8-44c8-b991-8c7a2a658d35",  // Language research: pick our first language
  "f6496a33-8508-4156-94e7-0e2ed8a5afa8",  // First-Dollar Mission (in-person repair work, not code)
  // Figma design tasks (require Figma access, not code)
  "360a8419-604d-4d39-8173-5785c47a14df",  // Figma: design the voice assistant app
  "d77306cb-59c3-4236-82bb-f6ec5e6a886f",  // Figma: design the driver app
  "97f8fa7c-e8e3-4faa-a129-40855af66eff",  // Figma: design the owner dashboard
  "a97ee7ff-e933-458a-a6a2-dd38023adbdd",  // Figma: design the creator app
];

for (const id of toDismiss) {
  const { data: opp } = await db.from("income_opportunities").select("title").eq("id", id).single();
  await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", id);
  // Fail any pending WQ entries
  const { data: wqItems } = await db.from("income_work_queue").select("id").eq("opportunity_id", id).eq("status", "pending");
  for (const wq of wqItems ?? []) {
    await db.from("income_work_queue").update({ status: "failed", progress_note: "Non-code or fake bounty aggregator" }).eq("id", wq.id);
  }
  console.log(`✗ ${opp?.title?.slice(0, 70)}`);
}
console.log(`\nDismissed ${toDismiss.length} items.`);

// Show remaining queued
const { data: remaining } = await db.from("income_opportunities")
  .select("title, score, reward_usd")
  .eq("status", "queued")
  .order("score", { ascending: false });
console.log(`\nRemaining queued (${remaining?.length}):`);
for (const o of remaining ?? []) console.log(`  [${o.score} $${o.reward_usd ?? 'null'}] ${o.title}`);
