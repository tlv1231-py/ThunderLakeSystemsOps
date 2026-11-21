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

const { data: queued } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, url, tags")
  .eq("status", "queued")
  .order("score", { ascending: false });

for (const opp of queued ?? []) {
  console.log(`\n[score=${opp.score} $${opp.reward_usd}] ${opp.title}`);
  console.log(`  ${opp.url}`);
  if (opp.tags?.length) console.log(`  tags: ${opp.tags.join(", ")}`);
}
console.log(`\nTotal: ${queued?.length} queued`);
