// Create WQ entries for queued opportunities that don't have active ones
// (equivalent to what the re-queue sweep does for browser-triggered scans)
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
const USER_ID = "9133c4a3-2734-4390-b9b8-19ddd4eecb8e";

// Find queued opportunities without active WQ entries
const { data: queued } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, repo_url")
  .eq("status", "queued")
  .eq("user_id", USER_ID)
  .order("score", { ascending: false });

let count = 0;
for (const opp of queued ?? []) {
  // Check for active WQ entry
  const { data: existing } = await db.from("income_work_queue")
    .select("id, status")
    .eq("opportunity_id", opp.id)
    .in("status", ["pending", "in_progress"]);

  if (existing?.length) {
    console.log(`  skip (active WQ): ${opp.title.slice(0, 60)}`);
    continue;
  }

  // Skip "from the Figma" items (will be cleaned by next scan)
  if (/from\s+the\s+figma/i.test(opp.title)) {
    console.log(`  skip (Figma dep): ${opp.title.slice(0, 60)}`);
    continue;
  }

  // Create WQ entry
  const { error } = await db.from("income_work_queue").insert({
    opportunity_id:    opp.id,
    repo_url:          opp.repo_url,
    status:            "pending",
    requires_approval: false,
    progress_note:     `Re-queued manually (score ${opp.score}, $${opp.reward_usd ?? 0})`,
    progress_pct:      0,
    user_id:           USER_ID,
  });

  if (error) {
    console.log(`  ERROR: ${error.message} — ${opp.title.slice(0, 50)}`);
  } else {
    console.log(`  ✓ queued: [${opp.score} $${opp.reward_usd ?? 'null'}] ${opp.title.slice(0, 60)}`);
    count++;
  }
}
console.log(`\nCreated ${count} WQ entries.`);
