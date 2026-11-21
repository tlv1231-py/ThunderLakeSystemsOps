/**
 * Check why Tyler's $20 ADT-community items were dismissed.
 * Shows the actual title, description snippets, and runs the filter checks.
 */
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

// Same NON_CODE_TITLE_PATTERNS as in route.ts (key ones)
const NON_CODE_TITLE_PATTERNS = [
  /\bpoem\b/i, /\bcontent creation\b/i, /\bwrite a\b/i, /\bgenerate text\b/i,
  /\blogo\b/i, /\bdesign\b.*\bmockup\b/i, /\bartwork\b/i,
  /\btutorial\b/i, /\bavailability inquiry\b/i, /\bpayment inquiry\b/i,
  /\bopen bounties right now\b/i, /\bbounty discovery\b/i,
  /\bbounty scout\b/i, /\bbounty report\b/i, /\bbounty tracker\b/i,
  /\blist \d+ \w/i, /^order-\d+/i, /atm phase/i,
  /bounty.{0,20}alert/i, /new.{0,20}bounti/i, /\d+\s+new.*bounti/i,
  /bounti.*found/i, /list.*bounti/i,
  /\[micro-bounty\]/i, /micro.{0,5}bounty/i,
  /\d+(\.\d+)?\s+(rtc|matic|sol|eth|btc|usdc|usdt)\b/i,
  /\bmaths bounty\b/i,
  /\[jules task\b/i, /jules task from/i,
  /^\[intake\]/i, /^\[question\]/i,
  /\d+\s+open bounties/i, /📋.*bounti/i,
  /^🎯\s/,
  /^dependency dashboard$/i,
];

const NON_CODE_SIGNALS = [
  "poem", "content creation", "write a ", "generate text", "blog post",
  "copywriting", "creative writing", "logo design", "artwork", "tweet",
  "tutorial", "availability inquiry", "payment inquiry", "open bounties right now",
  "bounty discovery", "research into ", "explain how to", "list of ", "list 20 ",
  "write documentation for", "create a guide for", "collect feedback",
];

const ANTI_FIT_TOPICS = [
  "solidity", "smart contract", "gas estimation", "gas optimization",
  " evm ", "defi protocol", " nft ", "token contract", "erc20", "erc-20",
  "firmware", "embedded system", "fpga", "nvme", "tlp frame",
  "zkproof", "zk-snark", "zero knowledge", "assembly language",
];

function checkItem(title, desc) {
  const titleMatch = NON_CODE_TITLE_PATTERNS.find(p => p.test(title ?? ""));
  const text = [(title ?? ""), (desc ?? "")].join(" ").toLowerCase();
  const signalMatch = NON_CODE_SIGNALS.find(s => text.includes(s));
  const antiMatch = ANTI_FIT_TOPICS.find(t => text.includes(t));
  return { titleMatch: titleMatch?.toString(), signalMatch, antiMatch };
}

// Get Tyler's dismissed $20 ADT-community items
const { data: items } = await db.from("income_opportunities")
  .select("id, title, score, status, reward_usd, url, description, tags")
  .eq("user_id", TYLER)
  .eq("status", "dismissed")
  .eq("reward_usd", 20)
  .ilike("url", "%ADT-community%")
  .limit(10);

console.log(`Found ${items?.length ?? 0} dismissed $20 ADT-community items for Tyler:\n`);

for (const item of items ?? []) {
  const { titleMatch, signalMatch, antiMatch } = checkItem(item.title, item.description);
  console.log(`📋 ${item.title?.slice(0, 60)}`);
  console.log(`   URL: ${item.url}`);
  console.log(`   Score: ${item.score} | Tags: ${(item.tags ?? []).join(",").slice(0, 40)}`);
  console.log(`   title filter: ${titleMatch || "NONE"}`);
  console.log(`   signal match: ${signalMatch || "NONE"}`);
  console.log(`   anti-topic:   ${antiMatch || "NONE"}`);
  console.log(`   desc snippet: ${(item.description ?? "").slice(0, 150)}`);
  console.log();
}
