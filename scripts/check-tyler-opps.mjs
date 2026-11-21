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

// Tyler's discovered items sorted by score
const { data: disc, error } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, status, open_prs, language, description")
  .eq("user_id", TYLER)
  .eq("status", "discovered")
  .order("score", { ascending: false })
  .limit(30);

if (error) { console.error("Error:", error.message); process.exit(1); }

console.log(`Tyler discovered (${disc?.length ?? 0} items, sorted by score):`);
disc?.forEach(o => {
  const r = o.reward_usd ?? 0;
  const s = o.score ?? 0;
  const p = o.open_prs ?? "?";
  const hasPolar = (o.description ?? "").toLowerCase().includes("polar.sh");
  const hasOpire = (o.description ?? "").toLowerCase().includes("opire.dev");
  const qual = (s >= 60 && r > 0 && (o.open_prs ?? 99) < 3) ? "✅QUALIFIES(HS)" :
               (r >= 20 && s >= 50 && (o.open_prs ?? 99) < 3) ? "✅QUALIFIES(MR)" :
               (o.source === "opire" && s >= 50 && (o.open_prs ?? 99) < 5) ? "✅QUALIFIES(OP)" : "";
  console.log(`  ${qual || "  "} score=${s} $${r || "?"} prs=${p} lang=${o.language ?? "?"} src=${o.source}${hasPolar?" [POLAR]":""}${hasOpire?" [OPIRE]":""}`);
  console.log(`    ${o.title?.slice(0, 70)}`);
});

// Also count queued
const { data: queued } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, source, open_prs")
  .eq("user_id", TYLER)
  .eq("status", "queued")
  .order("score", { ascending: false })
  .limit(10);
console.log(`\nTyler queued (${queued?.length ?? 0}):`);
queued?.forEach(o => console.log(`  score=${o.score} $${o.reward_usd ?? "?"} ${o.title?.slice(0, 60)}`));
