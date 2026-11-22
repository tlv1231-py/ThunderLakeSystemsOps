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

// Check Opire discovered items and their WQ entries
const { data: opps } = await db.from("income_opportunities")
  .select("id,title,score,status,source,reward_usd,tags")
  .eq("user_id", TYLER)
  .eq("source", "opire")
  .in("status", ["discovered", "queued"]);

for (const o of opps ?? []) {
  const { data: wq } = await db.from("income_work_queue")
    .select("id,status,progress_note")
    .eq("opportunity_id", o.id)
    .eq("user_id", TYLER);
  console.log("OPP score=" + o.score + " $" + o.reward_usd + " status=" + o.status, o.title?.slice(0, 55));
  console.log("  tags:", JSON.stringify(o.tags));
  console.log("  WQ:", (wq ?? []).length === 0 ? "none" : (wq ?? []).map(w => w.status + "(" + (w.progress_note ?? "").slice(0, 40) + ")").join(", "));
}
