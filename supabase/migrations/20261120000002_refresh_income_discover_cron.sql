-- Force-refresh the income discover cron job
-- Drops and re-creates to recover from any silent failure

-- Ensure extensions are present
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Unconditionally drop any existing job with this name
select cron.unschedule('income-discover-15min')
  where exists (select 1 from cron.job where jobname = 'income-discover-15min');

-- Re-schedule every 15 minutes
select cron.schedule(
  'income-discover-15min',
  '*/15 * * * *',
  $job$
  select net.http_get(url := 'https://thunder-lake-systems-ops.vercel.app/api/income/discover');
  $job$
);
