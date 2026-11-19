import type { DiscoveredOpportunity } from "./types";

// ── Scoring algorithm ─────────────────────────────────────────────────────────
// Composite 0–100 score weighing:
//   30pts  — tech stack match (with anti-fit language penalty)
//   25pts  — hourly rate / effort
//   20pts  — reward amount
//   15pts  — platform trust + payout reliability
//   10pts  — competition + recency + clarity bonuses

const PREFERRED_TECH = [
  "typescript", "javascript", "js", "ts", "react", "next.js", "nextjs",
  "node", "python", "css", "tailwind", "supabase", "postgres", "sql",
  "html", "svelte", "vue", "prisma", "graphql", "rest", "api",
];

// Languages where Claude's win rate will be very low — penalise heavily
const ANTI_FIT_LANGS = [
  "rust", "c", "c++", "cpp", "assembly", "asm", "haskell",
  "erlang", "elixir", "ocaml", "fortran", "cobol", "ada", "clojure",
];

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

  // ── Tech stack match (0–30) ───────────────────────────────────────────────
  const matchCount = PREFERRED_TECH.filter(t => techText.includes(t)).length;
  if (matchCount >= 3) score += 30;
  else if (matchCount >= 2) score += 24;
  else if (matchCount >= 1) score += 16;
  else score += 4;

  // ── Anti-fit language penalty ─────────────────────────────────────────────
  const lang = (opp.language ?? "").toLowerCase();
  const isAntiFit = ANTI_FIT_LANGS.some(l => lang === l || lang.startsWith(l));

  // ── Good-first-issue / beginner bonus (+8) ────────────────────────────────
  if (/good.first.issue|beginner.friendly|starter.issue|easy.fix/i.test(techText)) {
    score += 8;
  }

  // ── Issue clarity bonus (+6) ──────────────────────────────────────────────
  // Issues with code blocks, reproduction steps, or error messages are more
  // actionable — Claude can fix what it can clearly see.
  const hasCodeBlock    = (opp.description ?? "").includes("```");
  const hasReproSteps   = /steps to reproduce|reproduction|repro steps|how to|error:/i.test(desc);
  const hasErrorMessage = /exception|stacktrace|stack trace|panic:|error message/i.test(desc);
  if (hasCodeBlock || hasReproSteps || hasErrorMessage) score += 6;

  // ── Difficulty / estimated hours (0–25) ───────────────────────────────────
  const hours = estimateHours(opp);
  const reward = opp.reward_usd ?? 0;
  const hourlyEst = hours && reward > 0 ? reward / hours : null;

  if (hours != null) {
    if (hours <= 2)       score += 25;
    else if (hours <= 4)  score += 20;
    else if (hours <= 8)  score += 13;
    else if (hours <= 16) score += 7;
    else                  score += 2;
  } else {
    score += 10;
  }

  // ── Reward amount (0–20) ──────────────────────────────────────────────────
  if (reward > 0) {
    if (reward >= 1000)      score += 20;
    else if (reward >= 500)  score += 17;
    else if (reward >= 200)  score += 14;
    else if (reward >= 100)  score += 11;
    else if (reward >= 50)   score += 7;
    else                     score += 3;
  }

  // ── Platform trust (0–15) ─────────────────────────────────────────────────
  // opire = Stripe on merge (guaranteed); algora = same; issuehunt = usually reliable
  const platformScores: Record<string, number> = {
    opire:     15,
    algora:    15,
    issuehunt: 12,
    github:    8,
    manual:    10,
  };
  score += platformScores[opp.source] ?? 6;

  // ── Competition penalty (0–7) ─────────────────────────────────────────────
  const prs = opp.open_prs ?? 0;
  if (prs === 0)      score += 7;
  else if (prs === 1) score += 5;
  else if (prs === 2) score += 3;
  // 3+ open PRs → 0 (heavy competition)

  // Fresh discovery recency
  score += 3;

  // ── Deadline penalty ──────────────────────────────────────────────────────
  if (opp.deadline) {
    const daysLeft = (new Date(opp.deadline).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 2)    score -= 10;
    else if (daysLeft < 5) score -= 4;
  }

  // ── Anti-fit penalty: apply AFTER all additive scoring ───────────────────
  // Halve the score for languages where we have poor expected win rate.
  // Still non-zero so they appear in the list rather than being silently dropped.
  const rawScore = Math.max(0, Math.min(100, Math.round(score)));
  const finalScore = isAntiFit ? Math.round(rawScore * 0.5) : rawScore;

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
