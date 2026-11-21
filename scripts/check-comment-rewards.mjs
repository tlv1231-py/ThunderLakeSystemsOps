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
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "TLS-Scout/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
};

// Extract reward from comment text
function extractCommentReward(body) {
  const opireM = body.match(/(?:award(?:ed)?|reward|bounty)\s+(?:of\s+)?\$\s*([\d,]+(?:\.\d+)?)/i)
    || body.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:USD)?\s*(?:reward|bounty|award)/i);
  if (opireM) return parseFloat(opireM[1].replace(/,/g, ""));
  const ihM = body.match(/(?:funded|added)\s+\$\s*([\d,]+(?:\.\d+)?)/i);
  if (ihM) return parseFloat(ihM[1].replace(/,/g, ""));
  const genM = body.match(/(?:willing to pay|i'?ll pay|offering|bounty:?|prize:?)\s+\$\s*([\d,]+(?:\.\d+)?)/i);
  if (genM) return parseFloat(genM[1].replace(/,/g, ""));
  const plainM = body.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (plainM) return parseFloat(plainM[1].replace(/,/g, ""));
  return null;
}

// Tyler's discovered items without reward that have score >= 40 and have comments
const { data: items } = await db.from("income_opportunities")
  .select("id, title, score, url, metadata")
  .eq("user_id", TYLER)
  .eq("status", "discovered")
  .is("reward_usd", null)
  .gte("score", 40)
  .order("score", { ascending: false })
  .limit(30);

console.log(`Checking ${items?.length ?? 0} Tyler items for comment rewards...\n`);

let found = 0;
for (const item of items ?? []) {
  const comments = item.metadata?.comments ?? 0;
  if (comments === 0 || comments > 50) continue;

  // Convert GitHub issue URL to API URL
  const apiUrl = item.url
    .replace("https://github.com/", "https://api.github.com/repos/")
    + "/comments?per_page=25";

  try {
    const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) continue;
    const commentData = await res.json();

    for (const c of commentData) {
      const reward = extractCommentReward(c.body ?? "");
      if (reward && reward >= 5 && reward < 100000) {
        console.log(`💰 Found $${reward} in comment by @${c.user?.login}`);
        console.log(`   ${item.title?.slice(0, 60)} (score=${item.score})`);
        console.log(`   ${item.url}`);
        console.log(`   Comment: "${(c.body ?? "").slice(0, 100)}"`);
        // Update the opportunity with the found reward
        await db.from("income_opportunities")
          .update({ reward_usd: reward, reward_raw: `$${reward}` })
          .eq("id", item.id);
        found++;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 200)); // rate limit courtesy
  } catch (e) {
    // skip
  }
}

console.log(`\nFound and updated ${found} items with comment-extracted rewards.`);
