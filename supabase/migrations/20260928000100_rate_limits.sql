-- Fixed-window rate limiting, kept in the database so that it holds across
-- server instances.

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security;
-- No policies: only the service role touches this table.
revoke all on public.rate_limits from anon, authenticated;

-- Count one hit against a bucket and say whether it is within the limit.
create or replace function public.hit_rate_limit(
  target_bucket text,
  max_hits integer,
  window_seconds integer
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  slot timestamptz := to_timestamp(
    floor(extract(epoch from now()) / window_seconds) * window_seconds
  );
  total integer;
begin
  insert into public.rate_limits (bucket, window_start, hits)
  values (target_bucket, slot, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into total;

  -- Tidy up old windows now and then, without a scheduled job.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return total <= max_hits;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
