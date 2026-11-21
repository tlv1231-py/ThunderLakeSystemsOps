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

// All Tyler's opportunities by status
const { data: all } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, status, open_prs, language, created_at")
  .eq("user_id", TYLER)
  .order("created_at", { ascending: false })
  .limit(50);

const byStatus = {};
all?.forEach(o => { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; });
console.log("Tyler opportunities by status:", JSON.stringify(byStatus));

// Most recent items regardless of status
console.log("\nMost recent 20 Tyler opportunities:");
all?.slice(0, 20).forEach(o => {
  const created = o.created_at?.slice(0, 16);
  console.log(`  [${o.status}] score=${o.score ?? "?"} $${o.reward_usd ?? "?"} prs=${o.open_prs ?? "?"} src=${o.source}`);
  console.log(`    ${o.title?.slice(0, 70)} (${created})`);
});

// Also check WQ
const { data: wq } = await db.from("income_work_queue")
  .select("id, status, expected_usd, progress_note, pr_url, created_at")
  .eq("user_id", TYLER)
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\nTyler WQ (all statuses, last 10):");
wq?.forEach(w => {
  const shortPR = w.pr_url?.replace("https://github.com/", "") ?? "";
  const note = w.progress_note?.slice(0, 60) ?? "";
  console.log(`  [${w.status}] $${w.expected_usd ?? "?"} ${shortPR || note}`);
});
