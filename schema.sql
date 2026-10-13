-- FREE FIRE TOURNAMENT SCOREBOARD
-- Run this in Supabase SQL Editor. Public can SELECT; only rows in admin_users can mutate.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_scoreboard_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_scoreboard_admin() from public;
grant execute on function public.is_scoreboard_admin() to anon, authenticated;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_number smallint not null unique check (team_number between 1 and 12),
  name text not null default '' check (char_length(name) <= 80),
  representative text check (representative is null or char_length(representative) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_unique_lower
  on public.teams (lower(trim(name))) where trim(name) <> '';

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  placement smallint not null check (placement between 1 and 12),
  kills integer not null default 0 check (kills >= 0),
  placement_points integer generated always as (
    case placement
      when 1 then 12 when 2 then 9 when 3 then 8 when 4 then 7
      when 5 then 6 when 6 then 5 when 7 then 4 when 8 then 3
      when 9 then 2 when 10 then 1 when 11 then 0 when 12 then 0
    end
  ) stored,
  round_total integer generated always as (
    (case placement
      when 1 then 12 when 2 then 9 when 3 then 8 when 4 then 7
      when 5 then 6 when 6 then 5 when 7 then 4 when 8 then 3
      when 9 then 2 when 10 then 1 when 11 then 0 when 12 then 0
    end) + kills
  ) stored,
  -- Optional OCR file signature, never a trusted input for the score calculation.
  ocr_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scores_one_team_per_round unique (round_id, team_id),
  constraint scores_one_placement_per_round unique (round_id, placement)
);
create index if not exists scores_round_idx on public.scores(round_id);
create index if not exists scores_team_idx on public.scores(team_id);
create index if not exists scores_round_team_idx on public.scores(round_id, team_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams
for each row execute function public.set_updated_at();
drop trigger if exists scores_updated_at on public.scores;
create trigger scores_updated_at before update on public.scores
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.teams enable row level security;
alter table public.rounds enable row level security;
alter table public.scores enable row level security;

-- No policy allows users to insert/update/delete their own admin role.
drop policy if exists "admin list admins" on public.admin_users;
create policy "admin list admins" on public.admin_users for select to authenticated
using (public.is_scoreboard_admin());

drop policy if exists "public read teams" on public.teams;
create policy "public read teams" on public.teams for select to anon, authenticated using (true);
drop policy if exists "admins insert teams" on public.teams;
create policy "admins insert teams" on public.teams for insert to authenticated with check (public.is_scoreboard_admin());
drop policy if exists "admins update teams" on public.teams;
create policy "admins update teams" on public.teams for update to authenticated using (public.is_scoreboard_admin()) with check (public.is_scoreboard_admin());
drop policy if exists "admins delete teams" on public.teams;
create policy "admins delete teams" on public.teams for delete to authenticated using (public.is_scoreboard_admin());

drop policy if exists "public read rounds" on public.rounds;
create policy "public read rounds" on public.rounds for select to anon, authenticated using (true);
drop policy if exists "admins insert rounds" on public.rounds;
create policy "admins insert rounds" on public.rounds for insert to authenticated with check (public.is_scoreboard_admin());
drop policy if exists "admins update rounds" on public.rounds;
create policy "admins update rounds" on public.rounds for update to authenticated using (public.is_scoreboard_admin()) with check (public.is_scoreboard_admin());
drop policy if exists "admins delete rounds" on public.rounds;
create policy "admins delete rounds" on public.rounds for delete to authenticated using (public.is_scoreboard_admin());

drop policy if exists "public read scores" on public.scores;
create policy "public read scores" on public.scores for select to anon, authenticated using (true);
drop policy if exists "admins insert scores" on public.scores;
create policy "admins insert scores" on public.scores for insert to authenticated with check (public.is_scoreboard_admin());
drop policy if exists "admins update scores" on public.scores;
create policy "admins update scores" on public.scores for update to authenticated using (public.is_scoreboard_admin()) with check (public.is_scoreboard_admin());
drop policy if exists "admins delete scores" on public.scores;
create policy "admins delete scores" on public.scores for delete to authenticated using (public.is_scoreboard_admin());

-- Create exactly 12 numbered slots. Team names remain blank until the admin edits them.
insert into public.teams (team_number, name)
select n, '' from generate_series(1,12) as n
on conflict (team_number) do nothing;

-- Enable Realtime events for live clients (if not already present).
do $$
begin
  alter publication supabase_realtime add table public.teams;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; app still refreshes every 20 seconds';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.rounds;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; app still refreshes every 20 seconds';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.scores;
exception when duplicate_object then null;
when undefined_object then raise notice 'supabase_realtime publication not found; app still refreshes every 20 seconds';
end $$;

-- Grant table operations; RLS policies above still determine who may mutate.
grant select on public.teams, public.rounds, public.scores to anon, authenticated;
grant insert, update, delete on public.teams, public.rounds, public.scores to authenticated;
grant select on public.admin_users to authenticated;

-- IMPORTANT: After creating the first Auth user, give that user admin status manually
-- from the SQL Editor, replacing the UUID with the user's auth.users.id:
-- insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
-- Never add a public insert/update policy to admin_users.


-- Atomically update team kill totals derived from player rows. Either every team
-- update succeeds, or none does. The caller must still verify player names and mappings.
create or replace function public.set_round_team_kills(
  p_round_id uuid,
  p_team_kills jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  team_uuid uuid;
  kill_count integer;
  item_count integer := 0;
  distinct_count integer;
begin
  if not public.is_scoreboard_admin() then
    raise exception 'ไม่มีสิทธิ์กรรมการ';
  end if;
  if jsonb_typeof(p_team_kills) <> 'array' or jsonb_array_length(p_team_kills) = 0 then
    raise exception 'รายการคิวทีมไม่ถูกต้อง';
  end if;
  select count(*), count(distinct value->>'team_id')
    into item_count, distinct_count
    from jsonb_array_elements(p_team_kills) as entries(value);
  if item_count <> distinct_count then
    raise exception 'ทีมซ้ำในรายการคิว';
  end if;
  for item in select value from jsonb_array_elements(p_team_kills) as entries(value) loop
    begin
      team_uuid := (item->>'team_id')::uuid;
      kill_count := (item->>'kills')::integer;
    exception when others then
      raise exception 'ข้อมูลทีม/คิวไม่ถูกต้อง';
    end;
    if kill_count < 0 or (item->>'kills') !~ '^[0-9]+$' then
      raise exception 'คิวต้องเป็นจำนวนเต็มไม่ติดลบ';
    end if;
    if not exists (
      select 1 from public.scores s
      where s.round_id = p_round_id and s.team_id = team_uuid
    ) then
      raise exception 'ไม่พบคะแนนของทีมในรอบที่เลือก';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_team_kills) as entries(value) loop
    update public.scores
       set kills = (item->>'kills')::integer
     where round_id = p_round_id and team_id = (item->>'team_id')::uuid;
  end loop;
end;
$$;
revoke all on function public.set_round_team_kills(uuid, jsonb) from public;
grant execute on function public.set_round_team_kills(uuid, jsonb) to authenticated;
