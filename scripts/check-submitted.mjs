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

// All Tyler's submitted/review WQ items
const { data: submitted } = await db.from("income_work_queue")
  .select("id, status, expected_usd, pr_url, progress_note, title")
  .eq("user_id", TYLER)
  .in("status", ["submitted", "review", "done"])
  .order("expected_usd", { ascending: false });

console.log("Tyler submitted/review/done WQ items:");
submitted?.forEach(w => {
  const shortPR = w.pr_url?.replace("https://github.com/", "") ?? "no PR";
  console.log(`  [${w.status}] $${w.expected_usd ?? "?"} ${shortPR}`);
  console.log(`    ${w.title?.slice(0, 70)}`);
  console.log(`    ${w.progress_note?.slice(0, 80)}`);
});

// Also check all users' submitted items
const { data: allSub } = await db.from("income_work_queue")
  .select("id, status, expected_usd, pr_url, user_id")
  .in("status", ["submitted", "review"])
  .not("pr_url", "is", null);

console.log(`\nAll users submitted/review (${allSub?.length ?? 0}):`);
allSub?.forEach(w => {
  const uid = (w.user_id ?? "null").slice(0, 8);
  const shortPR = w.pr_url?.replace("https://github.com/", "") ?? "";
  console.log(`  [${w.status}] $${w.expected_usd ?? "?"} uid=${uid} ${shortPR}`);
});
