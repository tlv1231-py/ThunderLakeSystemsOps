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

// Find the privacy-the-game WQ entry
const { data: wq } = await db.from("income_work_queue")
  .select("id, opportunity_id, pr_url")
  .like("pr_url", "%privacy-the-game%");

console.log("Found:", wq?.length ?? 0, "WQ entries for privacy-the-game");
for (const item of wq ?? []) {
  await db.from("income_work_queue").update({
    status: "failed",
    progress_note: "Closed PR: karma-only bounty, agent submitted bad PR touching 100+ files"
  }).eq("id", item.id);
  if (item.opportunity_id) {
    await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", item.opportunity_id);
  }
  console.log("  Marked failed:", item.pr_url);
}
