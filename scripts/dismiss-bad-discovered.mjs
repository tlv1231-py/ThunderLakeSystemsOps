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

const { data: disc } = await db.from("income_opportunities")
  .select("id,title,reward_usd,score,source,open_prs")
  .eq("user_id", TYLER).eq("status", "discovered");

const BAD = [
  // Job listings
  /founding\s+\d+/i, /new\s+grad\s+20\d\d/i, /software\s+engineer\s+job/i,
  /entry.?level\s+(engineer|developer|position)/i,
  /\bhiring\s+(for\s+)?\d+/i,
  // Comparison / review articles (not code)
  /^compare:/i, /best\s+(git|app|tool)/i, /vs\.\s+(app|tool)/i,
  // AoC
  /aoc\s+20\d\d/i, /advent\s+of\s+code/i, /lateralus/i,
  // Deployment-only (no code)
  /woocommerce/i, /deploy\s+dank/i, /cpanel|plesk/i,
  // Hebrew / non-Latin
  /[֐-׿]{3,}/, /[؀-ۿ]{3,}/, /[一-鿿]{5,}/,
  // Bot status/trading sim
  /trading\s+(sim|bot\s+status)/i, /paper\s+trading/i,
];

const toDismiss = (disc ?? []).filter(d => {
  const t = d.title ?? "";
  return BAD.some(p => p.test(t));
});

console.log("Would dismiss", toDismiss.length, "items:");
for (const d of toDismiss) {
  console.log("  score=" + d.score + " $" + d.reward_usd + " [" + d.source + "] " + d.title?.slice(0, 70));
}

if (toDismiss.length > 0) {
  const ids = toDismiss.map(d => d.id);
  await db.from("income_opportunities").update({ status: "dismissed" }).in("id", ids);
  console.log("Dismissed.");
}
