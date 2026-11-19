// ── TLS Income Operations — shared types ──────────────────────────────────────

export type IncomeEngine = "bounty" | "asset" | "product" | "content";

export type OpportunityStatus =
  | "discovered" | "analyzing" | "queued" | "in_progress"
  | "submitted" | "accepted" | "rejected" | "paid" | "dismissed";

export type OpportunitySource = "algora" | "issuehunt" | "opire" | "github" | "manual";

export interface Opportunity {
  id: string;
  source: OpportunitySource;
  external_id: string | null;
  title: string;
  description: string | null;
  url: string;
  repo_url: string | null;
  reward_usd: number | null;
  reward_raw: string | null;
  currency: string;
  language: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  estimated_hours: number | null;
  score: number;
  hourly_rate_est: number | null;
  status: OpportunityStatus;
  tags: string[];
  metadata: Record<string, unknown>;
  open_prs: number;
  deadline: string | null;
  discovered_at: string;
  updated_at: string;
  user_id: string;
}

export interface Earning {
  id: string;
  engine: IncomeEngine;
  source: string;
  description: string;
  amount_usd: number;
  currency: string;
  status: "pending" | "collected";
  earned_date: string;
  collected_at: string | null;
  reference: string | null;
  evidence_url: string | null;
  opportunity_id: string | null;
  asset_id: string | null;
  created_at: string;
  notes: string | null;
}

export interface Asset {
  id: string;
  engine: IncomeEngine;
  name: string;
  category: string | null;
  description: string | null;
  marketplace: string | null;
  listing_url: string | null;
  status: "draft" | "packaging" | "ready" | "published" | "unlisted";
  production_date: string | null;
  quality_score: number | null;
  total_sales: number;
  total_revenue: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkItem {
  id: string;
  engine: IncomeEngine;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "review" | "submitted" | "done" | "failed" | "cancelled";
  priority: number;
  expected_usd: number | null;
  estimated_hours: number | null;
  hours_invested: number;
  opportunity_id: string | null;
  asset_id: string | null;
  requires_approval: boolean;
  approval_action: string | null;
  result: string | null;
  pr_url: string | null;
  progress_note: string | null;
  progress_pct: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  title: string;
  description: string;
  action_type: "register_account" | "submit_pr" | "publish_asset" | "claim_bounty" | "verify_identity";
  action_url: string | null;
  action_data: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "done";
  priority: number;
  work_item_id: string | null;
  opportunity_id: string | null;
  asset_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  notes: string | null;
}

export interface ActivityEntry {
  id: string;
  engine: string | null;
  action: string;
  detail: string | null;
  status: "ok" | "warning" | "error";
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Dashboard summary (returned by /api/income/status) ──────────────────────

export interface WinRateBySource {
  submitted: number;
  won: number;
  rate: number; // 0–1
}

export interface IncomeSummary {
  collectedThisWeek: number;
  collectedThisMonth: number;
  collectedLast30Days: number;
  pendingTotal: number;
  weeklyTarget: number;
  weeklyProgress: number;         // 0–1
  daysSinceLastPayment: number | null;
  byEngine: Record<IncomeEngine, { collected: number; pending: number }>;
  hoursInvested: number;
  effectiveHourly: number | null;
  activeOpportunities: number;
  pendingApprovals: number;
  lastDiscoveryRun: string | null;
  queueProjectedUsd: number;
  winRateBySource: Record<string, WinRateBySource>;
  recentEarnings: Earning[];
  topOpportunities: Opportunity[];
  workQueue: WorkItem[];
  approvals: Approval[];
  recentActivity: ActivityEntry[];
}

// ── Raw discovery record (returned from source fetchers) ──────────────────────

export type DiscoveredOpportunity = Omit<
  Opportunity,
  "id" | "score" | "hourly_rate_est" | "status" | "discovered_at" | "updated_at" | "user_id"
>;
