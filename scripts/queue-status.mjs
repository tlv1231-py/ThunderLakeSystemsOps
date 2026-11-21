import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const userId = "9133c4a3-2734-4390-b9b8-19ddd4eecb8e";

// Last scan time
const { data: lastScan } = await db.from("income_activity_log")
  .select("created_at, detail")
  .eq("user_id", userId)
  .eq("action", "scan_start")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log("Last scan:", lastScan?.created_at, "-", lastScan?.detail?.slice(0, 80));

// Pending queue
const { data: pending } = await db.from("income_work_queue")
  .select("id, title, expected_usd, priority")
  .eq("user_id", userId)
  .eq("status", "pending")
  .order("priority", { ascending: true })
  .limit(20);
console.log(`\nPending: ${pending?.length ?? 0}`);
for (const item of pending ?? []) {
  console.log(`  $${item.expected_usd ?? "?"} pri=${item.priority} - ${item.title?.slice(0, 70)}`);
}

// Review status items (fix committed, PR failed)
const { data: review } = await db.from("income_work_queue")
  .select("id, title, expected_usd, progress_note, pr_url")
  .eq("user_id", userId)
  .eq("status", "review")
  .limit(10);
console.log(`\nReview (fix committed, PR failed): ${review?.length ?? 0}`);
for (const item of review ?? []) {
  console.log(`  $${item.expected_usd ?? "?"} - ${item.title?.slice(0, 60)}`);
  console.log(`    ${item.progress_note?.slice(0, 80)}`);
}

// Recent submissions
const { data: submitted } = await db.from("income_work_queue")
  .select("title, pr_url, pr_number, expected_usd, completed_at")
  .eq("user_id", userId)
  .eq("status", "submitted")
  .order("completed_at", { ascending: false })
  .limit(10);
console.log(`\nSubmitted (${submitted?.length ?? 0}):`);
for (const item of submitted ?? []) {
  console.log(`  $${item.expected_usd ?? "?"} - PR#${item.pr_number} ${item.pr_url}`);
}
