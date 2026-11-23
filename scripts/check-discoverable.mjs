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

// All Tyler's discovered opportunities with any reward
const { data: opps } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, status, open_prs, language, description, created_at")
  .eq("user_id", TYLER)
  .eq("status", "discovered")
  .order("score", { ascending: false })
  .limit(30);

console.log(`Tyler discovered (top 30 by score):`);
opps?.forEach(o => {
  const prs = o.open_prs ?? "?";
  const lang = o.language ?? "?";
  const desc50 = (o.description ?? "").slice(0, 80).replace(/\n/g, " ");
  const hasPolar = (o.description ?? "").includes("polar.sh") || (o.description ?? "").includes("app.polar.sh");
  const hasOpire = (o.description ?? "").includes("opire.dev");
  console.log(`  score=${o.score} $${o.reward_usd ?? "?"} prs=${prs} lang=${lang} src=${o.source}${hasPolar?" [POLAR]":""}${hasOpire?" [OPIRE]":""}`);
  console.log(`    ${o.title?.slice(0, 70)}`);
});

console.log(`\nTotal: ${opps?.length ?? 0}`);
console.log("\nQualification breakdown (need score>=60 AND reward>0 AND prs<3, OR reward>=$20 AND score>=50 AND prs<3):");
opps?.forEach(o => {
  const r = o.reward_usd ?? 0;
  const s = o.score ?? 0;
  const p = o.open_prs ?? 99;
  const highScore = s >= 60 && p < 3 && r > 0;
  const medReward = r >= 20 && s >= 50 && p < 3;
  const opire = o.source === "opire" && s >= 50 && p < 5;
  if (highScore || medReward || opire) {
    console.log(`  QUALIFIES: ${o.title?.slice(0,60)} score=${s} $${r} prs=${p}`);
  }
});
