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

// Items with reward > 0 not dismissed/paid/submitted that aren't in Tyler's queue
const { data: items } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, user_id, status, open_prs")
  .gt("reward_usd", 0)
  .in("status", ["discovered", "queued"])
  .order("score", { ascending: false })
  .limit(30);

console.log("All reward>0 discovered/queued items:");
items?.forEach(o => {
  const uid = (o.user_id || "null").slice(0, 8);
  const eligible = (o.score >= 60 && (o.open_prs ?? 0) < 3 && o.reward_usd > 0) ||
                   (o.reward_usd >= 20 && o.score >= 50 && (o.open_prs ?? 0) < 3) ||
                   (o.source === "opire" && o.score >= 50 && (o.open_prs ?? 0) < 5);
  console.log(`  [${o.status} score=${o.score} $${o.reward_usd} uid=${uid} prs=${o.open_prs ?? 0}${eligible ? " ✓ELIGIBLE" : ""}] ${o.title?.slice(0, 55)}`);
});
console.log("\nTotal:", items?.length ?? 0);
console.log("Eligible for Tyler queue:", items?.filter(o =>
  ((o.score >= 60 && (o.open_prs ?? 0) < 3 && o.reward_usd > 0) ||
   (o.reward_usd >= 20 && o.score >= 50 && (o.open_prs ?? 0) < 3) ||
   (o.source === "opire" && o.score >= 50 && (o.open_prs ?? 0) < 5))
).length ?? 0);
