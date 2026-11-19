-- ── TLS Income Operations ──────────────────────────────────────────────────────
-- Persistent tables for the income-generation command center.
-- Engine A: immediate cash (bounties/tasks)
-- Engine B: digital asset factory
-- Engine C: software products
-- Engine D: automated content

-- ── Discovered opportunities (Engine A) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_opportunities (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source          TEXT        NOT NULL,          -- 'algora' | 'issuehunt' | 'github' | 'manual'
  external_id     TEXT,                          -- source-specific ID for dedup
  title           TEXT        NOT NULL,
  description     TEXT,
  url             TEXT        NOT NULL,
  repo_url        TEXT,
  reward_usd      NUMERIC(10,2),
  reward_raw      TEXT,                          -- raw reward string from source
  currency        TEXT        DEFAULT 'USD',
  language        TEXT,                          -- primary language of the repo
  difficulty      TEXT,                          -- 'easy' | 'medium' | 'hard' | null
  estimated_hours NUMERIC(5,1),
  score           NUMERIC(5,1) DEFAULT 0,        -- 0–100 composite score
  hourly_rate_est NUMERIC(8,2),                  -- reward / estimated_hours
  status          TEXT        DEFAULT 'discovered',
    -- discovered | analyzing | queued | in_progress | submitted | accepted | rejected | paid | dismissed
  tags            JSONB       DEFAULT '[]',
  metadata        JSONB       DEFAULT '{}',      -- source-specific extra data
  open_prs        INTEGER     DEFAULT 0,
  deadline        TIMESTAMPTZ,
  discovered_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  user_id         UUID        REFERENCES auth.users ON DELETE CASCADE,
  UNIQUE(source, external_id)
);

ALTER TABLE income_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_opportunities" ON income_opportunities FOR ALL
  USING (user_id = auth.uid());

-- ── Earnings ledger (all engines) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_earnings (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  engine          TEXT        NOT NULL,          -- 'bounty' | 'asset' | 'product' | 'content'
  source          TEXT        NOT NULL,          -- e.g. 'algora', 'gumroad', 'vscode-marketplace'
  description     TEXT        NOT NULL,
  amount_usd      NUMERIC(10,2) NOT NULL,
  currency        TEXT        DEFAULT 'USD',
  status          TEXT        DEFAULT 'pending', -- 'pending' | 'collected'
  earned_date     DATE        NOT NULL,
  collected_at    TIMESTAMPTZ,
  reference       TEXT,                          -- transaction / invoice ID
  evidence_url    TEXT,
  opportunity_id  UUID        REFERENCES income_opportunities ON DELETE SET NULL,
  asset_id        UUID,                          -- set when from Engine B/C
  user_id         UUID        REFERENCES auth.users ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT
);

ALTER TABLE income_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_earnings" ON income_earnings FOR ALL
  USING (user_id = auth.uid());

-- ── Generated assets / products (Engines B + C + D) ───────────────────────────
CREATE TABLE IF NOT EXISTS income_assets (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  engine          TEXT        NOT NULL,          -- 'asset' | 'product' | 'content'
  name            TEXT        NOT NULL,
  category        TEXT,                          -- 'tailwind-kit' | 'cli' | 'vscode-ext' | 'npm' | 'video' | ...
  description     TEXT,
  marketplace     TEXT,                          -- 'gumroad' | 'itch' | 'vscode-marketplace' | 'npm' | 'youtube'
  listing_url     TEXT,
  status          TEXT        DEFAULT 'draft',   -- 'draft' | 'packaging' | 'ready' | 'published' | 'unlisted'
  production_date DATE,
  quality_score   NUMERIC(3,1),                  -- 1.0–10.0
  total_sales     INTEGER     DEFAULT 0,
  total_revenue   NUMERIC(10,2) DEFAULT 0,
  metadata        JSONB       DEFAULT '{}',      -- files, preview_url, pricing, etc.
  user_id         UUID        REFERENCES auth.users ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE income_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_assets" ON income_assets FOR ALL
  USING (user_id = auth.uid());

-- ── Active work queue ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_work_queue (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  engine          TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        DEFAULT 'pending',
    -- pending | in_progress | review | submitted | done | failed | cancelled
  priority        INTEGER     DEFAULT 5,         -- 1 (highest) – 10 (lowest)
  expected_usd    NUMERIC(10,2),
  estimated_hours NUMERIC(5,1),
  hours_invested  NUMERIC(5,1) DEFAULT 0,
  opportunity_id  UUID        REFERENCES income_opportunities ON DELETE SET NULL,
  asset_id        UUID        REFERENCES income_assets ON DELETE SET NULL,
  requires_approval BOOLEAN   DEFAULT FALSE,
  approval_action TEXT,                          -- describes what approval is needed
  result          TEXT,                          -- PR URL, submission URL, notes
  user_id         UUID        REFERENCES auth.users ON DELETE CASCADE,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE income_work_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_work_queue" ON income_work_queue FOR ALL
  USING (user_id = auth.uid());

-- ── Human approval queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_approvals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  action_type     TEXT        NOT NULL,
    -- 'register_account' | 'submit_pr' | 'publish_asset' | 'claim_bounty' | 'verify_identity'
  action_url      TEXT,                          -- where to go to complete the action
  action_data     JSONB       DEFAULT '{}',
  status          TEXT        DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'done'
  priority        INTEGER     DEFAULT 5,
  work_item_id    UUID        REFERENCES income_work_queue ON DELETE SET NULL,
  opportunity_id  UUID        REFERENCES income_opportunities ON DELETE SET NULL,
  asset_id        UUID        REFERENCES income_assets ON DELETE SET NULL,
  user_id         UUID        REFERENCES auth.users ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT
);

ALTER TABLE income_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_approvals" ON income_approvals FOR ALL
  USING (user_id = auth.uid());

-- ── Activity log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_activity_log (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  engine      TEXT,                              -- null = system
  action      TEXT        NOT NULL,
  detail      TEXT,
  status      TEXT        DEFAULT 'ok',          -- 'ok' | 'warning' | 'error'
  metadata    JSONB       DEFAULT '{}',
  user_id     UUID        REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE income_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_income_activity_log" ON income_activity_log FOR ALL
  USING (user_id = auth.uid());

-- ── Helper function: update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_income_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_income_opportunities_updated_at
  BEFORE UPDATE ON income_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_income_updated_at();

CREATE TRIGGER trg_income_assets_updated_at
  BEFORE UPDATE ON income_assets
  FOR EACH ROW EXECUTE FUNCTION update_income_updated_at();

-- ── Useful indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_income_opps_status ON income_opportunities(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_income_opps_source ON income_opportunities(source, external_id);
CREATE INDEX IF NOT EXISTS idx_income_earnings_status ON income_earnings(status, earned_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_work_status ON income_work_queue(status, priority);
CREATE INDEX IF NOT EXISTS idx_income_approvals_pending ON income_approvals(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_income_log_created ON income_activity_log(created_at DESC);
