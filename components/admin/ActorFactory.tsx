"use client";

import { useState } from "react";
import {
  Bot, Activity, Sparkles, Cpu, GitBranch, DollarSign,
  ArrowRight, ChevronDown, ChevronUp, Terminal,
  TrendingUp, ExternalLink, Zap, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Pipeline ──────────────────────────────────────────────────────────────────

interface Stage {
  id: string;
  label: string;
  sub: string;
  icon: React.ElementType;
  infra: string;
  cadence: string;
}

const STAGES: Stage[] = [
  {
    id: "scan", label: "Store Scan", sub: "Finds demand / supply gaps",
    icon: Activity, infra: "GitHub Actions (free)", cadence: "Mon 6 am UTC",
  },
  {
    id: "analyze", label: "Gap Analysis", sub: "Scores + picks best target",
    icon: Sparkles, infra: "Claude API (~$0.03)", cadence: "After each scan",
  },
  {
    id: "build", label: "Build Actor", sub: "Reads API docs → generates TS",
    icon: Cpu, infra: "Claude API (~$0.10)", cadence: "1 Actor / run",
  },
  {
    id: "push", label: "Apify Push", sub: "Deploys + sends review email",
    icon: GitBranch, infra: "Apify CLI + GH Actions", cadence: "Auto on build",
  },
  {
    id: "earn", label: "Store Live", sub: "2-min review → 80 % rev share",
    icon: DollarSign, infra: "Apify Store (free listing)", cadence: "Passive 24 / 7",
  },
];

// ── Opportunities ─────────────────────────────────────────────────────────────

interface Opp {
  id: number;
  name: string;
  description: string;
  api: string;
  demand: "high" | "medium";
  competition: "none" | "weak";
  buildHours: number;
  pricingTier: string;
  monthlyLow: number;
  monthlyHigh: number;
  targetBuyer: string;
  priority: 1 | 2;
}

const OPPS: Opp[] = [
  {
    id: 1, priority: 1,
    name: "HN Who's Hiring Parser",
    description: "Parses monthly Hacker News hiring threads into structured records. Claude extracts tech stack, salary range, remote policy, company stage, and seniority level — data that existing Actors don't return.",
    api: "HN Algolia API — free, no auth, no rate limit", demand: "high", competition: "weak",
    buildHours: 4, pricingTier: "$2 / 1K records", monthlyLow: 100, monthlyHigh: 400,
    targetBuyer: "Recruiters, job boards, dev-tools companies",
  },
  {
    id: 2, priority: 1,
    name: "Reddit Buyer Intent Classifier",
    description: "Scrapes subreddits for buyer-intent signals. Claude scores each post 0–100 for purchase readiness, extracts budget mentions, tech-stack keywords, and decision-maker signals. No AI-enriched Reddit Actor exists on the Store.",
    api: "Reddit OAuth2 API — free, 60 req / min", demand: "high", competition: "none",
    buildHours: 8, pricingTier: "$1.50 / 1K posts", monthlyLow: 200, monthlyHigh: 800,
    targetBuyer: "B2B sales teams, growth hackers",
  },
  {
    id: 3, priority: 1,
    name: "GitHub Trending Repo Intel",
    description: "Trending repos with Claude-scored technical debt, contribution opportunity signals, dependency health, and language / framework classification.",
    api: "GitHub REST API — free, 5K req / hr", demand: "medium", competition: "none",
    buildHours: 6, pricingTier: "$2 / 1K repos", monthlyLow: 100, monthlyHigh: 350,
    targetBuyer: "VC firms, dev-tool companies, recruiters",
  },
  {
    id: 4, priority: 2,
    name: "Product Hunt Launch Intel",
    description: "PH launches with upvote velocity, maker profiles, and Claude-extracted market positioning, pricing model, and competitive classification. Existing Actors return raw data only — no intelligence layer.",
    api: "Product Hunt GraphQL API — free tier", demand: "medium", competition: "weak",
    buildHours: 8, pricingTier: "$3 / 1K launches", monthlyLow: 150, monthlyHigh: 500,
    targetBuyer: "PMs, founders, competitive-intel teams",
  },
  {
    id: 5, priority: 2,
    name: "SEC EDGAR Company Signals",
    description: "Extracts funding rounds, insider-trading activity, and 8-K event signals from SEC filings. Claude classifies risk level, event materiality, and flags unusual patterns. Premium buyer = higher price point.",
    api: "SEC EDGAR REST API — free, public", demand: "high", competition: "weak",
    buildHours: 16, pricingTier: "$5 / 1K filings", monthlyLow: 300, monthlyHigh: 1200,
    targetBuyer: "Investors, fintech teams, trading agents",
  },
];

// ── Revenue projection ────────────────────────────────────────────────────────

const PROJ = [
  { label: "Now",  actors: 0,  high: 0    },
  { label: "Mo 1", actors: 1,  high: 40   },
  { label: "Mo 2", actors: 2,  high: 150  },
  { label: "Mo 3", actors: 4,  high: 400  },
  { label: "Mo 4", actors: 6,  high: 700  },
  { label: "Mo 6", actors: 10, high: 1400 },
  { label: "Mo 9", actors: 16, high: 2500 },
  { label: "Mo 12",actors: 24, high: 4200 },
];
const MAX_PROJ = 4200;
const TARGET   = 2600; // $600 / wk ≈ $2,600 / mo

// ── YAML ──────────────────────────────────────────────────────────────────────

const YAML = `name: Actor Factory
on:
  schedule:
    - cron: '0 6 * * 1'   # Monday 6 am UTC
  workflow_dispatch:        # Manual trigger

jobs:
  factory:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g apify-cli
      - name: Run Actor Factory
        run: node scripts/actor-factory.mjs
        env:
          APIFY_TOKEN: \${{ secrets.APIFY_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: \${{ secrets.RESEND_API_KEY }}`;

const SCRIPT_STEPS = [
  { step: 1, action: "Scan Store", detail: "Call Apify Store Analyzer → get gap report (demand scores, competition counts, trending niches)" },
  { step: 2, action: "Pick Target", detail: "Claude analyzes report → ranks by demand × (1 / competition) → returns best opportunity JSON" },
  { step: 3, action: "Fetch API Docs", detail: "Claude fetches the target API's docs URL → reads full spec into context" },
  { step: 4, action: "Generate Actor", detail: "Claude writes TypeScript Actor: input schema, Apify SDK, fetch logic, dataset output, README" },
  { step: 5, action: "apify push", detail: "apify push --no-prompt deploys Actor to your Apify account" },
  { step: 6, action: "Notify", detail: "Resend email with Actor URL, opportunity score, estimated revenue, and 1-click publish link" },
];

// ── Tab nav ───────────────────────────────────────────────────────────────────

type Tab = "pipeline" | "opportunities" | "revenue" | "setup";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "pipeline",      label: "Pipeline",      icon: Zap       },
  { id: "opportunities", label: "Opportunities", icon: Target     },
  { id: "revenue",       label: "Revenue Map",   icon: TrendingUp },
  { id: "setup",         label: "Automation",    icon: Terminal   },
];

// ── Main component ────────────────────────────────────────────────────────────

export function ActorFactory() {
  const [tab, setTab]           = useState<Tab>("pipeline");
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Header ── */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
                <Bot className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  Actor Factory
                </h1>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Analyzes Apify Store · builds TypeScript Actors · ships weekly
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              <span className="text-zinc-500 font-mono">IDLE — not yet built</span>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Actors in Store",  value: "0",          sub: "→ 24 at Mo 12" },
              { label: "Monthly Runs",     value: "0",          sub: "→ tracking"    },
              { label: "Monthly Revenue",  value: "$0",         sub: "→ $2K+ target" },
              { label: "Next Build",       value: "HN Hiring",  sub: "4-hr build"    },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100 leading-none">{value}</p>
                <p className="mt-1 text-xs text-zinc-600">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="border-b border-zinc-800 px-6">
        <div className="mx-auto max-w-5xl flex gap-0 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                tab === id
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="mx-auto max-w-5xl px-6 py-8">

        {/* ─── PIPELINE ─── */}
        {tab === "pipeline" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
              <span className="font-medium">System not yet built.</span>
              {" "}The pipeline below is the target architecture — ship the GH Actions workflow + <code className="font-mono text-xs bg-zinc-800 px-1 py-0.5 rounded">actor-factory.mjs</code> to activate it.
            </div>

            {/* Stage cards — stack on mobile, row on sm+ */}
            <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
              {STAGES.map((stage, i) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="flex flex-row sm:flex-col sm:flex-1 items-start sm:items-stretch gap-3 sm:gap-0">
                    {/* Card */}
                    <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors group">
                      <div className="flex sm:flex-col items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors">
                          <Icon className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-100 leading-tight">{stage.label}</p>
                          <p className="mt-1 text-xs text-zinc-500 leading-snug">{stage.sub}</p>
                          <div className="mt-3 space-y-1">
                            <p className="text-[10px] font-mono text-zinc-600">{stage.infra}</p>
                            <p className="text-[10px] text-zinc-700">{stage.cadence}</p>
                          </div>
                          <div className="mt-3 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                            <span className="text-[10px] text-zinc-600 uppercase tracking-wide font-mono">pending build</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Arrow between stages */}
                    {i < STAGES.length - 1 && (
                      <div className="flex shrink-0 items-center justify-center sm:justify-end sm:pt-4 sm:pr-0 sm:w-auto sm:-mr-1.5 sm:z-10">
                        <ArrowRight className="h-4 w-4 text-zinc-700 rotate-90 sm:rotate-0" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Free-tier audit */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Free-tier compliance</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: "GitHub Actions", detail: "2,000 min / mo free · weekly run ≈ 10 min = 40 min used", ok: true },
                  { name: "Claude API",     detail: "~$0.13 / Actor build · 4 builds / mo ≈ $0.52 / mo",       ok: true },
                  { name: "Apify",          detail: "Free tier covers store listing + test runs",               ok: true },
                  { name: "Resend",         detail: "3K emails / mo free · 1 email / build = trivial",         ok: true },
                  { name: "Vercel",         detail: "No server needed — entire pipeline runs in GH Actions",   ok: true },
                  { name: "Supabase",       detail: "No DB needed — Apify handles all Actor + user data",      ok: true },
                ].map(({ name, detail, ok }) => (
                  <div key={name} className="flex gap-2.5">
                    <div className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center", ok ? "bg-emerald-500/15" : "bg-red-500/15")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-red-400")} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-300">{name}</p>
                      <p className="text-xs text-zinc-600 leading-snug mt-0.5">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── OPPORTUNITIES ─── */}
        {tab === "opportunities" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Ranked by <span className="text-zinc-300">demand × (1 / competition)</span> — build in this order.
              </p>
              <span className="text-xs font-mono text-zinc-600">5 targets identified</span>
            </div>

            {OPPS.map((opp) => {
              const isOpen = expanded === opp.id;
              return (
                <div
                  key={opp.id}
                  className={cn(
                    "rounded-xl border bg-zinc-900 overflow-hidden transition-colors",
                    opp.priority === 1 ? "border-cyan-500/30" : "border-zinc-800"
                  )}
                >
                  {/* Collapsed header */}
                  <button
                    className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-zinc-800/50 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : opp.id)}
                  >
                    {/* Priority badge */}
                    <span className={cn(
                      "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
                      opp.priority === 1 ? "bg-cyan-500/15 text-cyan-400" : "bg-blue-500/10 text-blue-400"
                    )}>
                      P{opp.priority}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <p className="text-sm font-semibold text-zinc-100">{opp.name}</p>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {/* Demand */}
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            opp.demand === "high" ? "bg-amber-500/15 text-amber-400" : "bg-zinc-700 text-zinc-400"
                          )}>
                            {opp.demand} demand
                          </span>
                          {/* Competition */}
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            opp.competition === "none" ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/10 text-blue-400"
                          )}>
                            {opp.competition} competition
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-zinc-500">
                        <span>{opp.pricingTier}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-emerald-400 font-medium">${opp.monthlyLow}–${opp.monthlyHigh} / mo</span>
                        <span className="text-zinc-700">·</span>
                        <span>{opp.buildHours}h build</span>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500 mt-0.5" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 mt-0.5" />
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-zinc-800 pt-4 space-y-4">
                      <p className="text-sm text-zinc-400 leading-relaxed">{opp.description}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
                          <p className="text-zinc-500 mb-1">API source</p>
                          <p className="text-zinc-300 font-mono">{opp.api}</p>
                        </div>
                        <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
                          <p className="text-zinc-500 mb-1">Target buyer</p>
                          <p className="text-zinc-300">{opp.targetBuyer}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── REVENUE ─── */}
        {tab === "revenue" && (
          <div className="space-y-6">
            {/* Target callout */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 flex items-start gap-4">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-300">$600 / week target</p>
                <p className="text-sm text-zinc-500 mt-1">
                  ~$2,600 / mo · achieved at Month 10–12 with ~20 Actors. Factory builds 1–2 / week automatically,
                  compounding as more Actors accumulate users, reviews, and Store SEO.
                </p>
              </div>
            </div>

            {/* Bar chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-6">Monthly revenue projection (high estimate)</p>

              {/* Chart area */}
              <div className="relative">
                {/* Target line label */}
                <div
                  className="absolute left-0 right-0 flex items-center gap-2 pointer-events-none"
                  style={{ bottom: `${(TARGET / MAX_PROJ) * 160}px` }}
                >
                  <div className="flex-1 border-t border-dashed border-amber-500/50" />
                  <span className="text-[10px] text-amber-500 font-mono whitespace-nowrap">$600 / wk</span>
                </div>

                {/* Bars */}
                <div className="flex items-end gap-2 h-40 pt-6">
                  {PROJ.map((pt) => {
                    const heightPct = MAX_PROJ > 0 ? (pt.high / MAX_PROJ) * 100 : 0;
                    return (
                      <div key={pt.label} className="flex-1 flex flex-col items-center gap-1 group">
                        {/* Value label */}
                        <span className={cn(
                          "text-[9px] font-mono whitespace-nowrap transition-colors",
                          pt.high >= TARGET ? "text-emerald-400" : "text-zinc-600"
                        )}>
                          {pt.high > 0 ? `$${pt.high >= 1000 ? `${(pt.high / 1000).toFixed(1)}K` : pt.high}` : "—"}
                        </span>
                        {/* Bar */}
                        <div className="w-full relative" style={{ height: `${Math.max(heightPct, 2)}%` }}>
                          <div className={cn(
                            "absolute inset-0 rounded-t transition-all",
                            pt.high >= TARGET
                              ? "bg-gradient-to-t from-emerald-700 to-emerald-500"
                              : "bg-gradient-to-t from-cyan-900 to-cyan-700 group-hover:to-cyan-600"
                          )} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Month labels */}
                <div className="flex gap-2 mt-2">
                  {PROJ.map((pt) => (
                    <div key={pt.label} className="flex-1 text-center">
                      <span className="text-[9px] text-zinc-600 font-mono">{pt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Projection table */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-500 font-medium">Month</th>
                    <th className="text-left px-4 py-3 text-zinc-500 font-medium">Actors</th>
                    <th className="text-left px-4 py-3 text-zinc-500 font-medium">Monthly High</th>
                    <th className="text-left px-4 py-3 text-zinc-500 font-medium">vs Target</th>
                  </tr>
                </thead>
                <tbody>
                  {PROJ.map((pt, i) => (
                    <tr key={pt.label} className={cn("border-b border-zinc-800/50 last:border-0", i % 2 === 0 ? "" : "bg-zinc-900/50")}>
                      <td className="px-4 py-2.5 text-zinc-400 font-mono">{pt.label}</td>
                      <td className="px-4 py-2.5 text-zinc-400">{pt.actors}</td>
                      <td className={cn("px-4 py-2.5 font-medium", pt.high >= TARGET ? "text-emerald-400" : "text-zinc-400")}>
                        {pt.high > 0 ? `$${pt.high.toLocaleString()}` : "$0"}
                      </td>
                      <td className="px-4 py-2.5">
                        {pt.high > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", pt.high >= TARGET ? "bg-emerald-500" : "bg-cyan-700")}
                                style={{ width: `${Math.min((pt.high / TARGET) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-zinc-600">{Math.round((pt.high / TARGET) * 100)}%</span>
                          </div>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── SETUP ─── */}
        {tab === "setup" && (
          <div className="space-y-6">
            {/* Secrets needed */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">GitHub Secrets required</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: "APIFY_TOKEN",      where: "apify.com → Account → Integrations → API tokens" },
                  { name: "ANTHROPIC_API_KEY", where: "console.anthropic.com → API Keys" },
                  { name: "RESEND_API_KEY",    where: "resend.com → API Keys" },
                ].map(({ name, where }) => (
                  <div key={name} className="rounded-lg bg-zinc-800 px-3 py-3">
                    <p className="font-mono text-xs text-cyan-400">{name}</p>
                    <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{where}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* GH Actions YAML */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                <span className="text-xs font-mono text-zinc-400">.github/workflows/actor-factory.yml</span>
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">GitHub Actions</span>
              </div>
              <pre className="px-5 py-4 text-[11px] text-zinc-400 font-mono leading-relaxed overflow-x-auto">
                <code>{YAML}</code>
              </pre>
            </div>

            {/* Script steps */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">scripts/actor-factory.mjs — step-by-step</p>
                <a
                  href="https://docs.apify.com/cli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors"
                >
                  Apify CLI docs <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <ol className="space-y-3">
                {SCRIPT_STEPS.map(({ step, action, detail }) => (
                  <li key={step} className="flex gap-3">
                    <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full border border-zinc-700 flex items-center justify-center text-[10px] font-mono text-zinc-500">
                      {step}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-300">{action}</p>
                      <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Cost estimate */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Monthly operating cost (4 builds / mo)</p>
              <div className="flex flex-wrap gap-4 text-xs">
                {[
                  { label: "GH Actions compute", cost: "$0.00", note: "~40 min used of 2,000 free" },
                  { label: "Claude API",          cost: "$0.52", note: "4 × $0.13 avg / build"      },
                  { label: "Apify",               cost: "$0.00", note: "free tier covers it"         },
                  { label: "Resend",              cost: "$0.00", note: "4 emails of 3,000 free"      },
                ].map(({ label, cost, note }) => (
                  <div key={label} className="flex-1 min-w-32">
                    <p className="text-zinc-500">{label}</p>
                    <p className="text-zinc-200 font-semibold mt-0.5">{cost}</p>
                    <p className="text-zinc-700 text-[10px] mt-0.5">{note}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Total monthly cost</span>
                <span className="text-xs font-semibold text-cyan-400">~$0.52 / mo</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
