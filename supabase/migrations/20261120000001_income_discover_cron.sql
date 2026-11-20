-- Enable pg_net for async HTTP calls
create extension if not exists pg_net with schema extensions;

-- Enable pg_cron for scheduled SQL jobs
create extension if not exists pg_cron;

-- Remove any existing job with this name
select cron.unschedule('income-discover-15min')
  where exists (select 1 from cron.job where jobname = 'income-discover-15min');

-- Schedule GET /api/income/discover every 15 minutes
select cron.schedule(
  'income-discover-15min',
  '*/15 * * * *',
  $job$
  select net.http_get(url := 'https://thunder-lake-systems-ops.vercel.app/api/income/discover');
  $job$
);
