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

// Last 5 scans
const { data: scans } = await db.from("income_activity_log")
  .select("created_at, detail, user_id")
  .eq("action", "scan_start")
  .order("created_at", { ascending: false })
  .limit(5);

console.log("Last 5 scans:");
scans?.forEach(s => {
  const uid = (s.user_id || "null").slice(0, 8);
  console.log(`  ${s.created_at} [uid=${uid}] ${s.detail}`);
});

// Tyler's pending WQ
const { data: pending } = await db.from("income_work_queue")
  .select("id, expected_usd, progress_note")
  .eq("user_id", "9133c4a3-2734-4390-b9b8-19ddd4eecb8e")
  .eq("status", "pending");
console.log("\nTyler pending WQ:", pending?.length ?? 0);
pending?.forEach(w => console.log(`  $${w.expected_usd ?? "?"} ${w.progress_note?.slice(0, 60)}`));
