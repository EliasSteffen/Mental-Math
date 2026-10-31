-- Takt für Push-Erinnerungen: pg_cron ruft jede Minute /api/push/tick auf (über pg_net, asynchron). Nur Supabase. Idempotent.
-- Setzt voraus: sql/004_push.sql. Das Token für den Aufruf liegt in public.push_config und wird nie angezeigt.
-- Andere Domain? → update public.push_config set tick_url = 'https://<domain>/api/push/tick' where id = 1;
-- Takt stoppen: select cron.unschedule('mental-math-push');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('mental-math-push', 'mental-math-push-cleanup');
end
$$;

select cron.schedule('mental-math-push', '* * * * *', $job$
  select net.http_post(
    url := c.tick_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || c.cron_token),
    timeout_milliseconds := 20000
  )
  from public.push_config c
  where c.id = 1
$job$);

-- Protokoll des Takts (eine Zeile pro Minute) nach 3 Tagen aufräumen – nur das dieser Jobs
select cron.schedule('mental-math-push-cleanup', '17 3 * * *', $job$
  delete from cron.job_run_details d
  using cron.job j
  where d.jobid = j.jobid and j.jobname like 'mental-math-push%' and d.end_time < now() - interval '3 days'
$job$);
