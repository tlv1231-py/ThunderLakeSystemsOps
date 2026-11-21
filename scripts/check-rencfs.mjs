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

const { data } = await db.from("income_opportunities")
  .select("id, title, score, reward_usd, description, tags, url, repo_url")
  .eq("title", "docs: add Windows support implementation research")
  .maybeSingle();

if (!data) {
  console.log("Not found by title, searching...");
  const { data: items } = await db.from("income_opportunities")
    .select("id, title, score, reward_usd, url")
    .ilike("title", "%Windows support%")
    .limit(5);
  items?.forEach(i => console.log(`  [score=${i.score} $${i.reward_usd}] ${i.title}`));
} else {
  console.log("Title:", data.title);
  console.log("Score:", data.score, "Reward:", data.reward_usd);
  console.log("URL:", data.url);
  console.log("Tags:", data.tags);
  console.log("Description snippet:", data.description?.slice(0, 500));
  const hasOpire = (data.description ?? "").toLowerCase().includes("opire.dev");
  const hasAlgora = (data.description ?? "").toLowerCase().includes("algora.io");
  const hasPolar = (data.description ?? "").toLowerCase().includes("polar.sh");
  console.log("Has opire.dev:", hasOpire, "Has algora.io:", hasAlgora, "Has polar.sh:", hasPolar);
}
