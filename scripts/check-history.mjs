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

// All Tyler's WQ items (all statuses)
const { data: all } = await db.from("income_work_queue")
  .select("id, status, expected_usd, pr_url, progress_note, created_at")
  .eq("user_id", TYLER)
  .order("created_at", { ascending: false })
  .limit(30);

console.log("All Tyler WQ items (last 30):");
all?.forEach(w => {
  const shortNote = w.progress_note?.slice(0, 50) ?? "";
  const shortPR = w.pr_url?.replace("https://github.com/", "") ?? "";
  console.log(`  [${w.status}] $${w.expected_usd ?? "?"} ${shortPR || shortNote}`);
});

// Summary by status
const byStatus = {};
all?.forEach(w => { byStatus[w.status] = (byStatus[w.status] ?? 0) + 1; });
console.log("\nBy status:", JSON.stringify(byStatus));
