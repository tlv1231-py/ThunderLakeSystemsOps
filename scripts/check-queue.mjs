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

const { data: wq } = await db.from("income_work_queue").select("status").eq("user_id", TYLER).in("status", ["pending", "in_progress"]);
console.log("Tyler pending WQ:", wq?.length ?? 0);

const { data: q } = await db.from("income_opportunities").select("id,title,score,reward_usd").eq("user_id", TYLER).eq("status", "queued").order("score", { ascending: false }).limit(10);
console.log("Tyler queued opps:", q?.length ?? 0);
q?.forEach(o => console.log(`  score=${o.score} $${o.reward_usd} ${o.title?.slice(0, 60)}`));

const { data: top } = await db.from("income_opportunities").select("id,title,score,reward_usd,user_id,status,source").gte("reward_usd", 20).not("status", "eq", "dismissed").order("score", { ascending: false }).limit(20);
console.log("\nAll reward>=20 non-dismissed:", top?.length ?? 0);
top?.forEach(o => console.log(`  [${o.status} score=${o.score} $${o.reward_usd} uid=${(o.user_id || "null").slice(0, 8)}] ${o.title?.slice(0, 55)}`));

const { data: disc } = await db.from("income_opportunities").select("id,title,score,reward_usd,user_id").eq("status", "discovered").gte("score", 40).order("score", { ascending: false }).limit(15);
console.log("\nDiscovered score>=40:", disc?.length ?? 0);
disc?.forEach(o => console.log(`  score=${o.score} $${o.reward_usd ?? 0} uid=${(o.user_id || "null").slice(0, 8)} ${o.title?.slice(0, 60)}`));
