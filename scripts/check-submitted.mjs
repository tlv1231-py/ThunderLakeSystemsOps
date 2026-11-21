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

// All submitted/in_progress WQ items for Tyler
const { data: wq } = await db.from("income_work_queue")
  .select("id, status, expected_usd, pr_url, progress_note, created_at")
  .eq("user_id", TYLER)
  .in("status", ["submitted", "in_progress", "pending"])
  .order("created_at", { ascending: false })
  .limit(20);
console.log("Tyler's WQ items:");
wq?.forEach(w => console.log(`  [${w.status}] $${w.expected_usd ?? "?"} ${w.pr_url ?? w.progress_note?.slice(0, 60)}`));

// All Tyler submitted income_opportunities
const { data: submitted } = await db.from("income_opportunities")
  .select("title, reward_usd, pr_url, status, created_at")
  .eq("user_id", TYLER)
  .in("status", ["submitted", "accepted", "paid"])
  .order("created_at", { ascending: false });
console.log("\nTyler submitted opps:", submitted?.length ?? 0);
submitted?.forEach(o => console.log(`  [${o.status}] $${o.reward_usd ?? "?"} ${o.title?.slice(0, 60)}`));
console.log("  PR URLs:", submitted?.map(o => o.pr_url).filter(Boolean));
