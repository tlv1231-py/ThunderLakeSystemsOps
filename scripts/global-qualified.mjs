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

// All items globally with reward_usd > 0 and score >= 40
const { data: items } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, status, open_prs, language, user_id, url")
  .gt("reward_usd", 0)
  .gte("score", 40)
  .order("score", { ascending: false })
  .limit(30);

console.log(`All users, reward>0, score>=40 (${items?.length ?? 0}):\n`);
items?.forEach(o => {
  const owner = (o.user_id ?? "").slice(0, 8);
  const r = o.reward_usd ?? 0;
  const s = o.score ?? 0;
  const p = o.open_prs ?? "?";
  const qual = (s >= 60 && r > 0 && (o.open_prs ?? 99) < 3) ? "✅HS" :
               (r >= 20 && s >= 50 && (o.open_prs ?? 99) < 3) ? "✅MR" :
               (o.source === "opire" && s >= 35 && (o.open_prs ?? 99) < 5) ? "✅OP" : "";
  console.log(`${qual || "  "} [${o.status}] uid=${owner} score=${s} $${r} prs=${p} src=${o.source} lang=${o.language ?? "?"}`);
  console.log(`    ${o.title?.slice(0, 70)}`);
  if (qual) console.log(`    ${o.url}`);
});
