"use client";

import { useState } from "react";
import {
  Zap, Database, Mail, Globe, GitBranch, Server,
  Clock, TrendingUp, Package, Cpu, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, Circle, ExternalLink,
  DollarSign, Timer, Wrench, Star, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Infra audit data ──────────────────────────────────────────────────────────

type InfraStatus = "live" | "idle" | "unused";

interface InfraItem {
  service: string;
  provider: string;
  limit: string;
  currentUse: string;
  status: InfraStatus;
  icon: React.ElementType;
}

const INFRA: InfraItem[] = [
  {
    service:    "App Hosting",
    provider:   "Vercel Hobby",
    limit:      "100K function invocations/mo · unlimited deployments",
    currentUse: "Next.js app + 2 cron jobs",
    status:     "live",
    icon:       Server,
  },
  {
    service:    "PostgreSQL + Auth",
    provider:   "Supabase Free",
    limit:      "500 MB DB · 50K monthly active users · 2M realtime messages",
    currentUse: "10 income tables · consulting ops · RLS policies",
    status:     "live",
    icon:       Database,
  },
  {
    service:    "Job Scheduler",
    provider:   "pg_cron (Supabase)",
    limit:      "No limit — runs inside the DB",
    currentUse: "Discovery scan every 15 min via pg_net HTTP call",
    status:     "live",
    icon:       Clock,
  },
  {
    service:    "Outbound HTTP",
    provider:   "pg_net (Supabase)",
    limit:      "Async, non-blocking — fires and forgets",
    currentUse: "Calls /api/income/discover on schedule",
    status:     "live",
    icon:       Globe,
  },
  {
    service:    "Email Delivery",
    provider:   "Resend Free",
    limit:      "3,000 emails/mo · 100/day",
    currentUse: "Invoice reminders only",
    status:     "idle",
    icon:       Mail,
  },
  {
    service:    "CI/CD Compute",
    provider:   "GitHub Actions",
    limit:      "2,000 min/mo public repos · unlimited private (self-hosted)",
    currentUse: "Unused — the biggest untapped asset",
    status:     "unused",
    icon:       GitBranch,
  },
  {
    service:    "Realtime Push",
    provider:   "Supabase Realtime",
    limit:      "500 concurrent connections · 2M messages/mo",
    currentUse: "Income dashboard live feed",
    status:     "live",
    icon:       Zap,
  },
  {
    service:    "Serverless Functions",
    provider:   "Vercel Functions",
    limit:      "60s max duration · 100K invocations/mo",
    currentUse: "API routes: discover, score, queue-batch, cron stubs",
    status:     "live",
    icon:       Cpu,
  },
];

// ── Automation status ─────────────────────────────────────────────────────────

interface AutomationItem {
  name: string;
  description: string;
  cadence: string;
  status: "autonomous" | "manual" | "not_built";
  revenue: string;
}

const AUTOMATIONS: AutomationItem[] = [
  {
    name:        "Bounty Discovery Scan",
    description: "pg_cron → pg_net → /api/income/discover → GitHub + Opire APIs",
    cadence:     "Every 15 minutes, 24/7",
    status:      "autonomous",
    revenue:     "Finds $20–$500 GitHub bounties, scores 0–100, auto-queues ≥60",
  },
  {
    name:        "Re-queue Sweep",
    description: "Every scan promotes discovered→queued items whose score now qualifies",
    cadence:     "Runs inside every discovery scan",
    status:      "autonomous",
    revenue:     "Scoring improvements automatically promote older opportunities",
  },
  {
    name:        "Stale Item Cleanup",
    description: "Dismisses queue items that now match blocklists / anti-topic filters",
    cadence:     "Runs inside every discovery scan",
    status:      "autonomous",
    revenue:     "Keeps queue clean — raises effective agent yield per run",
  },
  {
    name:        "Bounty Pipeline (Agent)",
    description: "income-agent.mjs: clone → Claude Code → PR → Supabase update",
    cadence:     "GitHub Actions cron — runs autonomously on queued items",
    status:      "autonomous",
    revenue:     "$50–$500 per merged PR — the Bounty Engine handles end-to-end",
  },
  {
    name:        "Invoice Reminders",
    description: "Vercel cron → /api/cron/send-reminders → Resend emails",
    cadence:     "Daily at 09:00 UTC",
    status:      "autonomous",
    revenue:     "Consulting AR — reduces days-past-due",
  },
  {
    name:        "Merge Monitor / Payout Trigger",
    description: "Watch submitted PRs for merge events → request payout on platform",
    cadence:     "Not built",
    status:      "not_built",
    revenue:     "Collects earned bounties without manual follow-up",
  },
  {
    name:        "High-Value Alert Email",
    description: "Email when score > 85 or reward > $200 — be first in",
    cadence:     "Not built",
    status:      "not_built",
    revenue:     "Critical edge: most competition forms within 2–4 hours of posting",
  },
];

// ── Pitched ideas ─────────────────────────────────────────────────────────────

type Effort = "low" | "medium" | "high";
type RevenueType = "active" | "passive" | "amplifier";
type IdeaCategory = "bounty" | "realworld";

interface Idea {
  id: number;
  title: string;
  tagline: string;
  pitch: string;
  mechanism: string;
  infra: string[];
  revenueEstimate: string;
  effort: Effort;
  revenueType: RevenueType;
  priority: 1 | 2 | 3;
  built?: boolean;
  category?: IdeaCategory;
}

const IDEAS: Idea[] = [
  {
    id:            1,
    title:         "Bounty Engine (GitHub Actions Agent)",
    tagline:       "Autonomous discovery → score → queue → clone → Claude Code → PR",
    pitch:         "Discovery, scoring, and queuing run 24/7 via pg_cron + pg_net. The pipeline agent (income-agent.mjs) clones repos, runs Claude Code on each queued bounty, and opens PRs. GitHub Actions provides 2,000 free compute-minutes per month to run this hands-free on a schedule — the full loop from opportunity to submitted PR requires zero manual steps.",
    mechanism:     "pg_cron every 15min → /api/income/discover → score + queue → GH Actions cron (hourly) → income-agent.mjs → clone → claude --print → commit → push → gh pr create → Supabase 'submitted'.",
    infra:         ["GitHub Actions (2,000 min/mo free)", "pg_cron + pg_net (Supabase, free)", "Vercel Functions (discover + score routes)"],
    revenueEstimate:"~100 agent attempts/mo · 15–25% success = 15–25 PRs · avg $50 = $750–$1,250/mo",
    effort:        "medium",
    revenueType:   "active",
    priority:      1,
    built:         true,
  },
  {
    id:            2,
    title:         "High-Value Bounty Alert",
    tagline:       "Get notified within minutes of a $200+ bounty appearing",
    pitch:         "Speed is the edge. Most good bounties see 3+ competing PRs within 6 hours of being posted. The discovery scan already runs every 15 minutes. Adding a Resend email trigger when score > 85 or reward > $200 means you can jump on the best opportunities before anyone else.",
    mechanism:     "Inside /api/income/discover: after scoring, if new item score ≥ 85 OR reward ≥ $200 → fire Resend email with issue link, reward, and estimated hours. 3 lines of code.",
    infra:         ["Resend free tier (3K emails/mo)", "Existing discover route", "Existing Resend API key"],
    revenueEstimate:"Multiplier on existing pipeline — faster submission = higher win rate on high-value items",
    effort:        "low",
    revenueType:   "amplifier",
    priority:      1,
  },
  {
    id:            3,
    title:         "Merged PR → Payout Monitor",
    tagline:       "Never leave earned money on the table",
    pitch:         "Every submitted PR that gets merged is potential income sitting uncollected. Currently the board needs manual checking. A Vercel cron job (or Supabase Edge Function triggered by a GitHub webhook) can scan submitted PRs, detect merges, and either automatically request payout (Opire does this via comment) or send an email prompt.",
    mechanism:     "Vercel cron at 00:00 UTC → fetch all 'submitted' work queue items → gh API check PR status → if merged: post /opire claim comment + mark 'accepted' in DB + Resend alert.",
    infra:         ["Vercel cron (free)", "GitHub API (existing token)", "Resend free tier", "Opire comment API"],
    revenueEstimate:"Collects income you already earned — zero additional cost or effort per payout",
    effort:        "low",
    revenueType:   "amplifier",
    priority:      1,
  },
  {
    id:            4,
    title:         "VS Code Extension Factory",
    tagline:       "Ship 10+ utility extensions, earn passive marketplace revenue",
    pitch:         "VS Code extensions are small (100–500 lines of TypeScript), easy to template, and earn passive income via the marketplace. Categories with high install rates: linting rule packs, snippet libraries, theme variants, and workflow helpers. GitHub Actions handles the build/publish pipeline automatically on each git push.",
    mechanism:     "Template repo → GitHub Actions workflow → `vsce publish` to VS Code Marketplace on tag push → README links to Gumroad/Ko-fi for premium bundle → monthly passive.",
    infra:         ["GitHub Actions (build + publish, free)", "VS Code Marketplace (free registration)", "GitHub Pages (docs site, free)"],
    revenueEstimate:"10 extensions × $20–50/mo avg = $200–500/mo passive after initial build",
    effort:        "medium",
    revenueType:   "passive",
    priority:      2,
  },
  {
    id:            5,
    title:         "npm Package Auto-Publishing",
    tagline:       "Extract clean utilities from bounty wins, publish as open-source packages",
    pitch:         "Every successful bounty PR contains working, tested code that fixed a real problem. The cleanest solutions become reusable npm packages. Add a GitHub Sponsors profile and link it in every README. Packages with 100K+ downloads command $50–200/month in sponsor income. GitHub Actions publishes on tag.",
    mechanism:     "Agent identifies reusable code in merged PRs → creates package stub → GH Actions runs `npm publish` on tag → README includes GitHub Sponsors + badge → periodic Resend report on download counts.",
    infra:         ["npm (free public packages)", "GitHub Sponsors (free)", "GitHub Actions (publish pipeline, free)"],
    revenueEstimate:"Sponsors from popular packages: $100–500/mo once packages gain traction",
    effort:        "medium",
    revenueType:   "passive",
    priority:      2,
  },
  {
    id:            6,
    title:         "Supabase Edge Function: GitHub Webhook Receiver",
    tagline:       "Real-time PR status sync — no polling, no lag",
    pitch:         "Currently the pipeline learns about PR merges by polling the GitHub API on a schedule. A GitHub webhook → Supabase Edge Function gives instant notification on PR open, merge, close, and review events. This feeds back into the win-rate scorer, identifies which repos and languages have the highest merge rate, and triggers immediate payout requests.",
    mechanism:     "GitHub repo webhook → Supabase Edge Function (Deno) → parse event → update income_work_queue status → trigger Resend if merged → update win-rate stats per source.",
    infra:         ["Supabase Edge Functions (2M free invocations/mo)", "GitHub webhook (free)", "Existing Supabase tables"],
    revenueEstimate:"Operational amplifier — faster status updates + better win-rate data = better scoring = higher future ROI",
    effort:        "medium",
    revenueType:   "amplifier",
    priority:      2,
  },
  {
    id:            7,
    title:         "Additional Bounty Sources",
    tagline:       "More sources = more opportunities discovered per scan",
    pitch:         "The current scan hits GitHub issues and Opire. Adding more sources expands the opportunity funnel with zero additional cost. Candidates: Gitcoin (non-crypto track), Open Collective maintainer work requests, Bountysource (legacy but active), and direct monitoring of well-funded open-source orgs that run bounty programs informally (Remix, tRPC, Zod).",
    mechanism:     "Add new fetcher functions to lib/income/discovery.ts → register in discoverAllOpportunities → they run inside the existing 15-minute pg_cron scan.",
    infra:         ["Existing discover route (Vercel function)", "Existing pg_cron schedule", "New public APIs — all free"],
    revenueEstimate:"Each new source adds 20–50 opportunities per scan cycle — more shots on goal",
    effort:        "low",
    revenueType:   "active",
    priority:      3,
  },
  {
    id:            8,
    title:         "Win-Rate Feedback Loop",
    tagline:       "Score smarter over time by learning from every outcome",
    pitch:         "Every submitted, merged, rejected, and abandoned PR is a data point. The scoring model currently uses static heuristics. A nightly Vercel cron that computes win rates by language, repo stars, reward range, and label type — then writes those weights back to a Supabase config table — makes the scorer learn from real outcomes with zero ongoing cost.",
    mechanism:     "Vercel cron (nightly) → aggregate income_opportunities by outcome × language × stars → compute p(win) per bucket → upsert to scorer_weights table → scoring.ts reads weights on next run.",
    infra:         ["Vercel cron (free)", "Supabase table (existing schema)", "Zero new services"],
    revenueEstimate:"Compounds every other engine — a 5% improvement in win rate on 100 attempts = 5 extra PRs merged/mo",
    effort:        "medium",
    revenueType:   "amplifier",
    priority:      3,
  },
  // ── Real-world / beyond-code ideas ───────────────────────────────────────────
  {
    id:            9,
    title:         "Programmatic SEO Affiliate Machine",
    tagline:       "pg_cron generates 10 AI-written comparison pages nightly → Google indexes → affiliate clicks pay automatically",
    pitch:         "The most reliably zero-human passive income model on the internet: programmatic SEO. Claude generates 'X vs Y', 'best tool for Z', and niche calculator pages targeting low-competition long-tail keywords. Vercel renders them as static pages (fastest possible indexing). Each page contains affiliate links for SaaS tools that pay 20–40% recurring commission (Supabase, Resend, Lemon Squeezy, Vercel itself, Linear, Notion all have affiliate programs). pg_cron fires nightly — 10 new pages published while you sleep. No clients. No reviews. No manual steps. After the 3–6 month SEO ramp, clicks convert to commissions 24/7.",
    mechanism:     "pg_cron nightly → Vercel Function: query keyword table → Claude generates 800-word article → Supabase insert → Next.js SSG revalidate → Vercel rebuilds static page → Google crawls → affiliate click → commission deposited automatically.",
    infra:         ["Vercel SSG (free hosting, instant revalidation)", "Supabase (content store + keyword queue)", "pg_cron (nightly trigger, existing)", "Claude API (~$0.03/page)", "Affiliate programs: free to join, auto-pay"],
    revenueEstimate:"1,000 pages × 50 visitors/mo avg × 2% CTR × $30 avg commission = $300/mo · scales to $1,500/mo at 5K pages",
    effort:        "medium",
    revenueType:   "passive",
    priority:      1,
    category:      "realworld",
  },
  {
    id:            10,
    title:         "Sell Your Stack as Templates",
    tagline:       "Package the bounty engine, pg_cron scheduler, and scoring algo as a Gumroad digital product",
    pitch:         "The systems you've built — pg_cron for free scheduling, income-agent.mjs, the 0–100 scoring algorithm — are more valuable to other developers as documented templates than as internal trade secrets. Bundle them as an 'Autonomous Income Stack' on Gumroad for $49–$97. GitHub delivers the template repo automatically on purchase. Zero hosting cost. Industry data shows automation blueprint sellers earning $500–$2,000/month passively once they build a library of 3–5 products. This is a one-time packaging job on work already done.",
    mechanism:     "Gumroad product listing ($49–$97) → buyer pays → automated delivery of GitHub template repo invite via Gumroad webhook → buyer gets full documented workflow. Zero server needed. Update once, sell forever.",
    infra:         ["Gumroad (free seller account, 10% transaction fee)", "GitHub template repos (free)", "No server or compute required"],
    revenueEstimate:"$49–$97/sale × 10 sales/mo = $490–$970/mo · grows as library expands",
    effort:        "low",
    revenueType:   "passive",
    priority:      1,
    category:      "realworld",
  },
  {
    id:            11,
    title:         "Pay-Per-Call AI API (Self-Serve SaaS)",
    tagline:       "Expose the bounty scorer and code-review tooling as a public API — Lemon Squeezy handles billing automatically",
    pitch:         "The scoring algorithm and Claude pipeline you've built are valuable to other developers who run bounty programs or want AI code review. Wrap them as a public REST API with per-call metered billing via Lemon Squeezy (zero code, they handle Stripe, VAT, global payments). Vercel hosts the endpoint. Supabase tracks usage per API key. The whole flow — sign up → get key → call API → get charged — is 100% automated, no human involved. The ask: developers pay $0.05–$0.20 per scored issue. 1,000 calls/day × $0.10 = $100/day.",
    mechanism:     "Vercel API route: validate key → decrement usage credits in Supabase → run scorer → return JSON → Lemon Squeezy webhook: on purchase, insert API key + credit balance into Supabase. Customer signs up, pays, uses, gets charged — zero human touch.",
    infra:         ["Vercel Functions (1 public API route)", "Supabase (api_keys table + usage tracking)", "Lemon Squeezy (billing, free merchant of record)", "Existing scoring logic (zero rewrite)"],
    revenueEstimate:"100 paying customers × $9/mo = $900/mo · usage-based: 10K calls/mo × $0.10 = $1,000/mo",
    effort:        "medium",
    revenueType:   "passive",
    priority:      1,
    category:      "realworld",
  },
  {
    id:            12,
    title:         "Auto-Newsletter + Affiliate Commission",
    tagline:       "Claude writes a weekly dev newsletter via pg_cron → Resend sends it → every issue earns affiliate commission",
    pitch:         "A fully automated newsletter that writes and sends itself. pg_cron fires every Monday at 08:00 UTC. A Vercel function asks Claude to generate a 600-word niche digest (e.g. 'This week in AI tools' or 'Open-source bounty roundup') — pulling fresh data from GitHub trending and Hacker News. Resend delivers it to subscribers. Each issue contains affiliate links for tools featured (20–40% recurring commission). Subscribers find the newsletter via an SEO-indexed landing page on your domain. No writing, no editing, no sending — just the initial setup and affiliate approvals.",
    mechanism:     "pg_cron Monday 08:00 UTC → Vercel Function → fetch GitHub trending + HN top posts → Claude generates digest + embeds affiliate links → Resend bulk send to subscriber list → Supabase logs sent issue. New subscriber: form submit → Supabase insert → Resend welcome → confirmed.",
    infra:         ["pg_cron (existing scheduler)", "Vercel Functions (1 generation route)", "Resend (3K emails/mo free)", "Supabase (subscriber table + issues log)", "Affiliate programs: auto-pay monthly"],
    revenueEstimate:"500 subscribers × 2% affiliate CTR × $30 avg commission = $300/mo · 2K subscribers = $1,200/mo · fully passive",
    effort:        "low",
    revenueType:   "passive",
    priority:      1,
    category:      "realworld",
  },
  {
    id:            13,
    title:         "Niche AI Jobs Aggregator",
    tagline:       "pg_cron pulls AI/automation jobs from 5 sources → Vercel renders an SEO-ranked niche job board",
    pitch:         "Use the scheduling infrastructure already running to pull AI/automation job listings from RemoteOK, Hacker News Who's Hiring, Wellfound, and LinkedIn jobs (via RSS). Supabase stores and deduplicates. Vercel SSR renders a niche job board (e.g. aijobsboard.dev) with clean, indexable URLs. As organic traffic compounds over 3–6 months, monetize via affiliate links to job-related tools, resume services, or a Resend newsletter. No new infra cost — this is the existing stack pointed at a new domain.",
    mechanism:     "pg_cron every hour → Vercel function fetches RemoteOK API + HN jobs RSS + Wellfound RSS → Supabase upsert (dedupe by URL) → Next.js SSR pages with dynamic routes → Resend weekly digest newsletter → affiliate links in job listings.",
    infra:         ["Vercel (SSR hosting, free)", "Supabase (job store + dedup)", "pg_cron (existing scheduler)", "Resend (weekly newsletter, free tier)", "Free job APIs: RemoteOK, HN, Wellfound RSS"],
    revenueEstimate:"10K monthly visitors × $0.50 RPM affiliate = $500/mo · newsletter sponsorship = $200/mo · 3–6 month ramp",
    effort:        "medium",
    revenueType:   "passive",
    priority:      2,
    category:      "realworld",
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InfraStatus }) {
  if (status === "live")   return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800">LIVE</span>;
  if (status === "idle")   return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800">IDLE</span>;
  return                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">UNUSED</span>;
}

function AutoStatusDot({ status }: { status: AutomationItem["status"] }) {
  if (status === "autonomous") return <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />;
  if (status === "manual")     return <AlertCircle  className="h-4 w-4 text-amber-400 flex-shrink-0" />;
  return                              <Circle       className="h-4 w-4 text-zinc-600 flex-shrink-0" />;
}

function EffortBadge({ effort }: { effort: Effort }) {
  const map = {
    low:    { label: "Low effort",    cls: "bg-emerald-900/30 text-emerald-400 border-emerald-800" },
    medium: { label: "Medium effort", cls: "bg-blue-900/30 text-blue-400 border-blue-800" },
    high:   { label: "High effort",   cls: "bg-amber-900/30 text-amber-400 border-amber-800" },
  };
  const { label, cls } = map[effort];
  return <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", cls)}>{label}</span>;
}

function RevTypeBadge({ type }: { type: RevenueType }) {
  const map = {
    active:    { label: "Active",    cls: "bg-violet-900/30 text-violet-400 border-violet-800" },
    passive:   { label: "Passive",   cls: "bg-sky-900/30 text-sky-400 border-sky-800" },
    amplifier: { label: "Amplifier", cls: "bg-orange-900/30 text-orange-400 border-orange-800" },
  };
  const { label, cls } = map[type];
  return <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", cls)}>{label}</span>;
}

function PriorityBadge({ p }: { p: 1 | 2 | 3 }) {
  if (p === 1) return <span className="text-xs font-bold text-zinc-900 px-2 py-0.5 rounded-full bg-zinc-100">P1</span>;
  if (p === 2) return <span className="text-xs font-medium text-zinc-400 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700">P2</span>;
  return              <span className="text-xs font-medium text-zinc-600 px-2 py-0.5 rounded-full border border-zinc-800">P3</span>;
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-xl border bg-zinc-900 transition-colors",
      idea.built     ? "border-emerald-800/60" :
      idea.priority === 1 ? "border-zinc-600" : "border-zinc-800",
    )}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-zinc-800/40 transition-colors rounded-xl"
      >
        <span className="text-lg font-bold text-zinc-600 mt-0.5 w-5 flex-shrink-0">{idea.id}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-100">{idea.title}</h3>
            {idea.built
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 border border-emerald-700">BUILT ✓</span>
              : <PriorityBadge p={idea.priority} />
            }
            <EffortBadge effort={idea.effort} />
            <RevTypeBadge type={idea.revenueType} />
          </div>
          <p className="text-xs text-zinc-400">{idea.tagline}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="text-xs font-medium text-emerald-400 hidden sm:block">{idea.revenueEstimate.split("·")[0].split("=")[0].trim()}</span>
          {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-4">
          {/* Pitch */}
          <p className="text-sm text-zinc-300 leading-relaxed">{idea.pitch}</p>

          {/* Mechanism */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">How it works</p>
            <p className="text-xs text-zinc-400 font-mono bg-zinc-800/60 rounded-lg px-3 py-2 leading-relaxed">{idea.mechanism}</p>
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Free infra used</p>
              <ul className="space-y-1">
                {idea.infra.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Revenue estimate</p>
              <p className="text-xs text-emerald-400 leading-relaxed">{idea.revenueEstimate}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NexusHub() {
  const [activeTab, setActiveTab] = useState<"infra" | "automations" | "ideas" | "roadmap">("ideas");

  const tabs = [
    { id: "ideas",       label: "Ideas",       count: IDEAS.length },
    { id: "infra",       label: "Infra Audit", count: INFRA.length },
    { id: "automations", label: "What's Live",  count: AUTOMATIONS.filter(a => a.status === "autonomous").length },
    { id: "roadmap",     label: "Roadmap",      count: null },
  ] as const;

  const bountyIdeas = IDEAS.filter(i => i.category !== "realworld");
  const realWorldIdeas = IDEAS.filter(i => i.category === "realworld");
  const p1 = bountyIdeas.filter(i => i.priority === 1);
  const p2 = bountyIdeas.filter(i => i.priority === 2);
  const p3 = bountyIdeas.filter(i => i.priority === 3);
  const rw1 = realWorldIdeas.filter(i => i.priority === 1);
  const rw2 = realWorldIdeas.filter(i => i.priority === 2);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Zap className="h-5 w-5 text-amber-400" />
          <h1 className="text-xl font-semibold text-zinc-100">Autonomous Profit Nexus</h1>
        </div>
        <p className="text-sm text-zinc-500">
          Deep audit of every free resource available — with concrete pitches for making each one generate income reliably, hands-free.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Free infra layers",   value: INFRA.length,                              sub: "Zero monthly cost" },
          { label: "Live automations",    value: AUTOMATIONS.filter(a => a.status === "autonomous").length, sub: "Running 24/7" },
          { label: "Ideas pitched",       value: IDEAS.length,                              sub: `${IDEAS.filter(i => i.category === "realworld").length} beyond bounties` },
          { label: "Max potential / mo",  value: "$3,500+",                                 sub: "Conservative estimate" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
            <p className="text-xl font-bold text-zinc-100">{value}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{label}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "text-zinc-100 border-zinc-100"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            )}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-1.5 text-xs text-zinc-600">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Ideas */}
      {activeTab === "ideas" && (
        <div className="space-y-6">
          {/* Priority 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-zinc-100" />
              <h2 className="text-sm font-semibold text-zinc-100">Priority 1 — Highest impact, build first</h2>
            </div>
            <div className="space-y-2">
              {p1.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
            </div>
          </div>

          {/* Priority 2 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-400">Priority 2 — Build once, earn passively</h2>
            </div>
            <div className="space-y-2">
              {p2.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
            </div>
          </div>

          {/* Priority 3 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="h-4 w-4 text-zinc-600" />
              <h2 className="text-sm font-semibold text-zinc-600">Priority 3 — Compounders (do these after P1/P2)</h2>
            </div>
            <div className="space-y-2">
              {p3.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
            </div>
          </div>

          {/* Real-world divider */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-700" /></div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-3 text-xs font-semibold text-amber-400 uppercase tracking-widest">Beyond Bounties — Real World Revenue</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 -mt-2 mb-1">
            Agent money-making outside GitHub — consulting leads, digital products, marketplaces, and services. All run on the same free infra.
          </p>

          {/* Real-world P1 */}
          {rw1.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-amber-300">High Impact — start here</h2>
              </div>
              <div className="space-y-2">
                {rw1.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
              </div>
            </div>
          )}

          {/* Real-world P2 */}
          {rw2.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-700/80">Medium Term — build after the quick wins</h2>
              </div>
              <div className="space-y-2">
                {rw2.map(idea => <IdeaCard key={idea.id} idea={idea} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Infra Audit */}
      {activeTab === "infra" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Every service below is permanently free. No credit card required, no trial expiry.</p>
          {INFRA.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.service} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-zinc-800 flex-shrink-0">
                  <Icon className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-zinc-200">{item.service}</span>
                    <span className="text-xs text-zinc-600">{item.provider}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-xs text-zinc-500 mb-1">{item.limit}</p>
                  <p className="text-xs text-zinc-400">{item.currentUse}</p>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 mt-4">
            <p className="text-xs font-semibold text-zinc-400 mb-1">The key insight</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              pg_cron + pg_net is already making HTTP calls every 15 minutes at zero cost — a scheduler that runs forever without a server.
              GitHub Actions is 2,000 free compute minutes per month sitting unused. These two together are enough to run a fully autonomous
              bounty pipeline with no monthly spend.
            </p>
          </div>
        </div>
      )}

      {/* Tab: What's Live */}
      {activeTab === "automations" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">What's already running autonomously vs. what still needs a human trigger.</p>
          {AUTOMATIONS.map(a => (
            <div key={a.name} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-start gap-3">
              <AutoStatusDot status={a.status} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-zinc-200">{a.name}</span>
                  {a.status === "not_built" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-600">Not built</span>
                  )}
                  {a.status === "manual" && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-amber-800 bg-amber-900/30 text-amber-400">Manual trigger</span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mb-1 font-mono">{a.description}</p>
                <p className="text-xs text-zinc-400">{a.cadence}</p>
                <p className="text-xs text-zinc-500 mt-1">{a.revenue}</p>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 px-4 py-3 mt-4">
            <p className="text-xs font-semibold text-amber-400 mb-1">The gap to close</p>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              The discovery-to-queue pipeline is fully autonomous. The only manual step is running the agent.
              GitHub Actions as free compute is the missing piece that makes the entire system hands-free.
            </p>
          </div>
        </div>
      )}

      {/* Tab: Roadmap */}
      {activeTab === "roadmap" && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">Recommended build order — each phase builds on the last.</p>

          {[
            {
              phase: "Phase A",
              title: "Close the loop",
              timeline: "1–2 days",
              color: "emerald",
              items: [
                { label: "High-value bounty alert email (3 lines of code in discover route)", idea: 2 },
                { label: "Merged PR monitor + Opire payout trigger (new Vercel cron)", idea: 3 },
              ],
            },
            {
              phase: "Phase B",
              title: "Full autonomy",
              timeline: "3–5 days",
              color: "blue",
              items: [
                { label: "GitHub Actions workflow: hourly agent run on queued bounties", idea: 1 },
                { label: "Supabase Edge Function: GitHub webhook receiver for instant PR status", idea: 6 },
              ],
            },
            {
              phase: "Phase C",
              title: "Passive revenue layer",
              timeline: "1–2 weeks",
              color: "violet",
              items: [
                { label: "VS Code extension factory — template + GH Actions publish pipeline", idea: 4 },
                { label: "npm package auto-publish from clean bounty solutions", idea: 5 },
              ],
            },
            {
              phase: "Phase D",
              title: "Compound returns",
              timeline: "Ongoing",
              color: "zinc",
              items: [
                { label: "Add more bounty sources to discovery (Gitcoin, Open Collective)", idea: 7 },
                { label: "Win-rate feedback loop — scoring weights learn from outcomes", idea: 8 },
              ],
            },
          ].map(phase => (
            <div key={phase.phase} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className={cn(
                "px-4 py-3 border-b border-zinc-800 flex items-center justify-between",
                phase.color === "emerald" ? "bg-emerald-900/20" :
                phase.color === "blue"    ? "bg-blue-900/20" :
                phase.color === "violet"  ? "bg-violet-900/20" : "bg-zinc-800/30"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded-full",
                    phase.color === "emerald" ? "bg-emerald-900 text-emerald-300" :
                    phase.color === "blue"    ? "bg-blue-900 text-blue-300" :
                    phase.color === "violet"  ? "bg-violet-900 text-violet-300" : "bg-zinc-800 text-zinc-400"
                  )}>{phase.phase}</span>
                  <span className="text-sm font-semibold text-zinc-200">{phase.title}</span>
                </div>
                <span className="text-xs text-zinc-500">{phase.timeline}</span>
              </div>
              <ul className="px-4 py-3 space-y-2">
                {phase.items.map(item => (
                  <li key={item.label} className="flex items-start gap-2 text-xs text-zinc-400">
                    <ArrowRight className="h-3 w-3 text-zinc-600 mt-0.5 flex-shrink-0" />
                    <span>{item.label}</span>
                    <span className="text-zinc-700 ml-1">→ idea #{item.idea}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              Revenue model at full build-out
            </p>
            <div className="space-y-1.5">
              {[
                ["Engine A (Bounties, fully autonomous)",       "$750–$1,250/mo",  "active"],
                ["Engine B (VS Code extensions)",             "$200–$500/mo",    "passive"],
                ["Engine B (npm packages + sponsors)",        "$100–$300/mo",    "passive"],
                ["Engine C (Programmatic SEO + affiliate)",   "$300–$1,500/mo",  "passive"],
                ["Engine C (Pay-per-call AI API)",            "$450–$1,800/mo",  "passive"],
                ["Engine C (Auto-newsletter + affiliate)",    "$300–$1,200/mo",  "passive"],
                ["Engine C (Gumroad template sales)",         "$490–$970/mo",    "passive"],
                ["Engine C (AI jobs board — 6mo ramp)",       "$500–$700/mo",    "passive"],
              ].map(([label, value, type]) => (
                <div key={label as string} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{label as string}</span>
                  <span className={cn(
                    "font-medium",
                    type === "existing" ? "text-zinc-400" :
                    type === "passive"  ? "text-sky-400" : "text-emerald-400"
                  )}>{value as string}</span>
                </div>
              ))}
              <div className="pt-1.5 mt-1.5 border-t border-zinc-800 flex items-center justify-between text-xs font-semibold">
                <span className="text-zinc-300">Conservative monthly total (all engines)</span>
                <span className="text-emerald-300">$2,500–$6,000/mo</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
