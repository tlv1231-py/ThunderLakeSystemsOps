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

// Dismiss all pending WQ items with $0 reward and their linked opportunities
const { data: zeroPending } = await db.from("income_work_queue")
  .select("id, opportunity_id, expected_usd, progress_note")
  .eq("status", "pending")
  .or("expected_usd.is.null,expected_usd.eq.0");

console.log("Pending $0/null reward WQ items:", zeroPending?.length ?? 0);

for (const item of zeroPending ?? []) {
  console.log(`  Dismissing: ${item.progress_note?.slice(0, 60)}`);
  await db.from("income_work_queue").update({ status: "failed", progress_note: "Dismissed: no reward specified" }).eq("id", item.id);
  if (item.opportunity_id) {
    await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", item.opportunity_id);
  }
}
console.log("Done.");
