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

const { data: pending } = await db.from("income_work_queue")
  .select("id, user_id, expected_usd, progress_note, opportunity_id, repo_url")
  .eq("status", "pending")
  .order("created_at", { ascending: true });

console.log("All pending WQ:", pending?.length ?? 0);
pending?.forEach(w => {
  console.log(`  [uid=${(w.user_id || "null").slice(0,8)}] $${w.expected_usd ?? "?"} ${w.progress_note?.slice(0,80)}`);
  console.log(`    opp_id=${w.opportunity_id} repo=${w.repo_url?.slice(0,60)}`);
});
