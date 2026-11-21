import type { DiscoveredOpportunity } from "./types";

// ── Scoring algorithm ─────────────────────────────────────────────────────────
// Composite 0–100 score weighing:
//   25pts  — code clarity (error message, repro steps, code snippet = best predictor)
//   20pts  — tech stack match (TypeScript/JS/Python/React core)
//   20pts  — platform auto-pay reliability (Algora/Opire = Stripe on merge)
//   15pts  — scope / estimated hours (< 2h is ideal)
//   10pts  — reward amount
//    7pts  — competition (open PRs) + recency
//    3pts  — good-first-issue / quick-win bonuses
// Penalties: anti-fit topic (×0.3), anti-fit language (×0.5), non-code (×0.2)

const PREFERRED_TECH = [
  "typescript", "javascript", "js", "ts", "react", "next.js", "nextjs",
  "node", "python", "css", "tailwind", "supabase", "postgres", "sql",
  "html", "svelte", "vue", "prisma", "graphql", "rest", "api",
  "go", "golang", "ruby", "rails", "php", "java", "kotlin", "swift",
];

// ── Things that look like bounties but require expertise Claude can't win ──────
// If a bounty description contains these, it's a 70% score cut regardless of language.
const ANTI_FIT_TOPICS = [
  // Web3 / blockchain / crypto (Solidity/EVM expertise required)
  "solidity", "smart contract", "gas estimation", "gas optimization",
  " evm ", "defi protocol", " nft ", "token contract", "erc20", "erc-20",
  "erc721", "uniswap", "web3.js", "ethers.js", "hardhat", "foundry",
  "truffle", "wagmi", "viem", "on-chain", "onchain", "usdc bounty", "usdt bounty",
  // Hardware / firmware / embedded (C/C++ domain expertise required)
  "firmware", "embedded system", "fpga", "asic", "bootloader",
  "pcie ", "pcix ", "nvme", "tlp frame", " dma ", " ecc ", "bch code",
  "bch syndrome", "ldpc code", "zns frame", "interrupt handler",
  "memory mapped", "register map", "device driver",
  // Deep cryptography (requires math PhD-level)
  "zkproof", "zk-snark", "zk-stark", "zero knowledge proof", "homomorphic",
  "elliptic curve crypto", "ecdsa implementation", "secp256",
  // Assembly / binary (no win path)
  "assembly language", "linker script", "syscall implementation",
  "binary patch", "disassembler",
];

// ── Languages where Claude's win rate will be very low — penalise heavily ──────
const ANTI_FIT_LANGS = [
  "rust", "c", "c++", "cpp", "assembly", "asm", "haskell",
  "erlang", "ocaml", "fortran", "cobol", "ada",
];

// ── Meta/research tasks that are not code implementations ─────────────────────
const NON_CODE_SIGNALS = [
  "poem", "content creation", "write a ", "generate text", "blog post",
  "copywriting", "creative writing", "logo design", "artwork", "tweet",
  "tutorial", "availability inquiry", "payment inquiry", "open bounties right now",
  "bounty discovery", "research into ", "explain how to", "list of ", "list 20 ",
  "write documentation for", "create a guide for", "collect feedback",
];

// ── Code clarity signals — the single best predictor of winnability ────────────
const CLARITY_SIGNALS = {
  codeBlock:    (d: string) => d.includes("```"),
  errorMessage: (d: string) => /exception|stacktrace|stack trace|panic:|error message|TypeError|AttributeError|NullPointerException|ENOENT|EACCES/i.test(d),
  reproSteps:   (d: string) => /steps to reproduce|reproduction|repro steps|to reproduce|expected behavior|actual behavior|error:/i.test(d),
  failingTest:  (d: string) => /failing test|test fails|unit test|test case|assertion|assert\(|expect\(/i.test(d),
  specificLine: (d: string) => /line \d+|column \d+|at function|\.ts:\d+|\.js:\d+|\.py:\d+/i.test(d),
};

// ── Quick-win: tiny verifiable fixes Claude wins near-100% ────────────────────
const QUICK_WIN_SIGNALS = [
  "typo", "typos", "dead link", "broken link", "documentation", "readme",
  "missing type", "type error", "wrong type", "deprecat", "lint error",
  "spelling", "grammar", "broken image", "404 link", "outdated doc",
  "missing semicolon", "import error", "wrong import", "circular import",
  "missing export", "undefined variable",
];

// Called from discover route to skip anti-topic bounties before scoring/storing
export function isAntiTopic(opp: DiscoveredOpportunity): boolean {
  const text = [opp.title, opp.description ?? "", ...(opp.tags ?? []), opp.language ?? ""]
    .join(" ").toLowerCase();
  return ANTI_FIT_TOPICS.some(t => text.includes(t));
}

// Called from discover route to skip non-code bounties before scoring/storing
export function isNonCodeTask(opp: DiscoveredOpportunity): boolean {
  const text = [opp.title, opp.description ?? "", ...(opp.tags ?? [])]
    .join(" ").toLowerCase();
  return NON_CODE_SIGNALS.some(s => text.includes(s));
}

export function scoreOpportunity(opp: DiscoveredOpportunity): {
  score: number;
  estimated_hours: number | null;
  hourly_rate_est: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
} {
  let score = 0;

  const techText = [opp.language, ...(opp.tags ?? []), opp.title, opp.description]
    .join(" ").toLowerCase();
  const desc = (opp.description ?? "").toLowerCase();
  const title = (opp.title ?? "").toLowerCase();

  // ── Code clarity (0–25) — HIGHEST WEIGHT: best predictor of winnability ──────
  // Each unique signal adds pts; stack them. Clear issue = agent can solve it.
  const clarityCount = Object.values(CLARITY_SIGNALS).filter(fn => fn(desc)).length;
  if (clarityCount >= 4)      score += 25;
  else if (clarityCount >= 3) score += 20;
  else if (clarityCount >= 2) score += 15;
  else if (clarityCount >= 1) score += 8;
  // 0 clarity signals → 0 pts (vague issues rarely win)

  // ── Tech stack match (0–20) ───────────────────────────────────────────────
  const matchCount = PREFERRED_TECH.filter(t => techText.includes(t)).length;
  if (matchCount >= 3) score += 20;
  else if (matchCount >= 2) score += 16;
  else if (matchCount >= 1) score += 10;
  else score += 2;

  // ── Platform auto-pay reliability (0–20) ─────────────────────────────────
  // Algora & Opire pay automatically on merge via Stripe — zero payout friction.
  // GitHub issues that carry `opire` or `algora` labels are funded on those platforms
  // and should score like Opire/Algora, not plain GitHub.
  const platformScores: Record<string, number> = {
    opire:     20,
    algora:    20,
    issuehunt: 13,
    github:    6,
    manual:    8,
  };
  const tags = (opp.tags ?? []).map(t => t.toLowerCase());
  const hasOpireTag  = tags.includes("opire")  || (opp.description ?? "").toLowerCase().includes("opire.dev");
  const hasAlgoraTag = tags.includes("algora") || (opp.description ?? "").toLowerCase().includes("algora.io");
  const effectiveSource = opp.source === "github" && hasOpireTag  ? "opire"
    : opp.source === "github" && hasAlgoraTag ? "algora"
    : opp.source;
  score += platformScores[effectiveSource] ?? 4;

  // ── Scope / estimated hours (0–15) ────────────────────────────────────────
  const hours = estimateHours(opp);
  const reward = opp.reward_usd ?? 0;
  const hourlyEst = hours && reward > 0 ? reward / hours : null;

  if (hours != null) {
    if (hours <= 1)       score += 15;  // 1-hour fixes are almost always winnable
    else if (hours <= 2)  score += 13;
    else if (hours <= 4)  score += 9;
    else if (hours <= 8)  score += 5;
    else if (hours <= 16) score += 2;
    // > 16h → 0 (multi-day tasks rarely win with auto-agents)
  } else {
    score += 5; // unknown scope: modest assumption
  }

  // ── Reward amount (0–10) ──────────────────────────────────────────────────
  if (reward >= 500)       score += 10;
  else if (reward >= 200)  score += 8;
  else if (reward >= 100)  score += 6;
  else if (reward >= 50)   score += 4;
  else if (reward >= 20)   score += 2;
  else if (reward > 0)     score += 1;
  // 0 reward → 0 pts (not necessarily a disqualifier — some bounties pay on merge)

  // ── Competition (0–5) + recency (+2) ─────────────────────────────────────
  const prs = opp.open_prs ?? 0;
  if (prs === 0)      score += 5;
  else if (prs === 1) score += 3;
  else if (prs === 2) score += 1;
  score += 2; // fresh discovery bonus

  // ── Good-first-issue / quick-win bonuses (+8 each, non-stacking) ─────────
  if (/good.first.issue|beginner.friendly|starter.issue|easy.fix/i.test(techText)) {
    score += 8;
  }
  if (QUICK_WIN_SIGNALS.some(s => techText.includes(s))) score += 8;

  // ── Deadline penalty ──────────────────────────────────────────────────────
  if (opp.deadline) {
    const daysLeft = (new Date(opp.deadline).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 2)      score -= 15;
    else if (daysLeft < 5) score -= 5;
  }

  // ── Classify anti-fit / non-code for final penalty ────────────────────────
  const lang = (opp.language ?? "").toLowerCase();
  const isAntiFitLang  = ANTI_FIT_LANGS.some(l => lang === l || lang.startsWith(l));
  const isAntiFitTopic = isAntiTopic(opp);
  const isNonCode      = isNonCodeTask(opp);

  const rawScore = Math.max(0, Math.min(100, Math.round(score)));

  // Apply penalties in order of severity (worst wins if multiple apply)
  const finalScore = isNonCode      ? Math.round(rawScore * 0.2)   // 80% cut
    : isAntiFitTopic ? Math.round(rawScore * 0.3)   // 70% cut
    : isAntiFitLang  ? Math.round(rawScore * 0.5)   // 50% cut
    : rawScore;

  return {
    score:            finalScore,
    estimated_hours:  hours,
    hourly_rate_est:  hourlyEst ? Math.round(hourlyEst * 100) / 100 : null,
    difficulty:       classifyDifficulty(opp, hours),
  };
}

function estimateHours(opp: DiscoveredOpportunity): number | null {
  if (opp.estimated_hours) return opp.estimated_hours;

  const text = [opp.title, opp.description ?? "", ...(opp.tags ?? [])].join(" ").toLowerCase();

  const hrMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hrMatch) return parseFloat(hrMatch[1]);

  // Quick-win signals = 1 hour
  if (QUICK_WIN_SIGNALS.some(s => text.includes(s))) return 1;

  if (/\bgood\s+first\s+issue\b|\beasy\b|\bsmall\b|\bquick\b/.test(text)) return 2;
  if (/\bmedium\b|\bmoderate\b|\bintermediate\b/.test(text))                return 6;
  if (/\bhard\b|\bcomplex\b|\badvanced\b|\bdifficult\b/.test(text))         return 12;

  if (opp.reward_usd) return Math.round((opp.reward_usd / 80) * 2) / 2;

  return null;
}

function classifyDifficulty(
  opp: DiscoveredOpportunity,
  hours: number | null,
): "easy" | "medium" | "hard" | null {
  if (opp.difficulty) return opp.difficulty as "easy" | "medium" | "hard";
  if (hours == null) return null;
  if (hours <= 3)  return "easy";
  if (hours <= 8)  return "medium";
  return "hard";
}
