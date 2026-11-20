-- Increase pg_net timeout to 55s so the HTTP connection stays open while Vercel
-- processes the discovery scan (default 5s causes silent connection drops mid-run)
select cron.unschedule('income-discover-15min')
  where exists (select 1 from cron.job where jobname = 'income-discover-15min');

select cron.schedule(
  'income-discover-15min',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url              := 'https://thunder-lake-systems-ops.vercel.app/api/income/discover',
    timeout_milliseconds := 55000
  );
  $job$
);
