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

// Find the Lume naptár WQ item
const { data: items } = await db.from("income_work_queue")
  .select("id,title,status,opportunity_id,pr_url")
  .eq("user_id", TYLER)
  .ilike("title", "%lume naptár%");

for (const item of items ?? []) {
  console.log("Fixing:", item.title, "| status:", item.status);
  await db.from("income_work_queue").update({
    status: "failed",
    progress_note: "Bot-generated Hungarian blog issue — not a real bounty, $1264 was a false reward extraction"
  }).eq("id", item.id);
  if (item.opportunity_id) {
    await db.from("income_opportunities").update({ status: "dismissed" }).eq("id", item.opportunity_id);
  }
  await db.from("income_activity_log").insert({
    engine: "bounty", action: "pr_closed",
    detail: `Dismissed: "Lume naptár" — bot-generated issue, false $1264 reward extraction. PR #33 closed.`,
    status: "warning", user_id: TYLER,
  });
  console.log("Done.");
}
