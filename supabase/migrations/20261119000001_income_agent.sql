-- Income agent progress tracking columns
ALTER TABLE income_work_queue
  ADD COLUMN IF NOT EXISTS progress_note TEXT,
  ADD COLUMN IF NOT EXISTS progress_pct  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pr_url        TEXT,
  ADD COLUMN IF NOT EXISTS pr_number     INTEGER,
  ADD COLUMN IF NOT EXISTS repo_url      TEXT,
  ADD COLUMN IF NOT EXISTS branch_name   TEXT,
  ADD COLUMN IF NOT EXISTS agent_log     TEXT;

-- Enable realtime on work queue so dashboard gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE income_work_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE income_activity_log;
