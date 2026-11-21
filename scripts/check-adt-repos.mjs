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

// Check the high-value repos ADT is submitting to that Tyler might be missing
for (const repo of ["pootle", "Crystal-PDF", "AUREN", "numfocus", "AUREN"]) {
  const { data } = await db.from("income_opportunities")
    .select("id, title, score, status, reward_usd, user_id")
    .ilike("url", `%${repo}%`)
    .limit(5);
  if (data?.length) {
    console.log(`=== ${repo} ===`);
    data.forEach(o => console.log(` [${o.status}] uid=${o.user_id.slice(0, 8)} score=${o.score} $${o.reward_usd} ${o.title?.slice(0, 50)}`));
  } else {
    console.log(`=== ${repo} === NOT IN DB`);
  }
}

// Also check what Tyler has that is score >= 50 reward > 0 (regardless of status)
console.log("\n=== Tyler's reward>0 items (all statuses) ===");
const { data: tylItems } = await db.from("income_opportunities")
  .select("id, title, score, status, reward_usd, url")
  .eq("user_id", TYLER)
  .gt("reward_usd", 0)
  .gte("score", 40)
  .order("score", { ascending: false })
  .limit(20);
tylItems?.forEach(o => console.log(` [${o.status}] score=${o.score} $${o.reward_usd} ${o.title?.slice(0, 60)}`));
console.log(`Total: ${tylItems?.length ?? 0}`);
