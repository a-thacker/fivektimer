-- ============================================================
-- 5K RACE — MIGRATION for an EXISTING 5KTimer/TriTimer database
-- Run this whole file in the Supabase SQL Editor (once).
--
-- What it does:
--   1. Deletes ALL kids-run data.
--   2. Removes the team feature + t-shirt + race-type columns.
--   3. Adds email + liability-waiver columns for public sign-ups.
--   4. Collapses settings to a single race.
--   5. Locks the database down with Row Level Security:
--        • the public (anon) key can ONLY submit registrations
--        • it can NEVER read anyone's data (emails, roster, etc.)
--        • public results/clock read through safe, curated functions
--        • the organizer app must sign in (Supabase Auth) to see data
--
-- ⚠️  BACK UP FIRST (Supabase → Database → Backups) — this drops columns.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Delete all traces of the kids run
-- ------------------------------------------------------------
delete from timing_records where race_type = 'kids_run';
delete from race_events    where race_type = 'kids_run';
delete from participants   where race_type = 'kids_run';

-- Old team-only timing rows have no participant — they're obsolete.
delete from timing_records where participant_id is null;

-- ------------------------------------------------------------
-- 2. Drop race-type / team / t-shirt columns
--    (dropping a column also drops its CHECK constraints + indexes)
-- ------------------------------------------------------------
alter table participants   drop column if exists race_type;
alter table participants   drop column if exists is_team;
alter table participants   drop column if exists team_color;
alter table participants   drop column if exists team_role;
alter table participants   drop column if exists tshirt_size;

alter table race_events    drop column if exists race_type;

alter table timing_records drop column if exists race_type;
alter table timing_records drop column if exists team_color;

-- ------------------------------------------------------------
-- 3. New columns for public self-registration + legal waiver
-- ------------------------------------------------------------
alter table participants add column if not exists email text;
alter table participants add column if not exists waiver_accepted boolean not null default false;
alter table participants add column if not exists waiver_accepted_at timestamptz;

-- Public sign-ups arrive without a bib number; the organizer assigns one
-- at check-in, so race_number must be nullable.
alter table participants alter column race_number drop not null;

-- Exactly one timing row per participant.
alter table timing_records alter column participant_id set not null;

-- ------------------------------------------------------------
-- 4. Collapse app_settings to a single race
-- ------------------------------------------------------------
alter table app_settings add column if not exists results_released boolean not null default false;
update app_settings set results_released = coalesce(results_released, false);

-- migrate the old per-race release flag if it exists
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'app_settings' and column_name = 'trail_results_released') then
    update app_settings set results_released = coalesce(trail_results_released, false);
  end if;
end $$;

alter table app_settings drop column if exists trail_results_released;
alter table app_settings drop column if exists kids_run_results_released;

alter table app_settings
  alter column clock_display_categories set default
  '{"overall":true,"men":true,"women":true,"age_group":false}'::jsonb;
update app_settings
  set clock_display_categories = '{"overall":true,"men":true,"women":true,"age_group":false}'::jsonb;

insert into app_settings (id) values (1) on conflict do nothing;

-- ------------------------------------------------------------
-- 5. Age-group trigger (unchanged — recreated to be safe)
-- ------------------------------------------------------------
create or replace function calc_age_group(p_age integer)
returns text language plpgsql immutable as $$
begin
  if p_age is null then return null;
  elsif p_age <= 14 then return '14 & Under';
  elsif p_age <= 19 then return '15-19';
  elsif p_age <= 29 then return '20-29';
  elsif p_age <= 39 then return '30-39';
  elsif p_age <= 49 then return '40-49';
  elsif p_age <= 59 then return '50-59';
  elsif p_age <= 69 then return '60-69';
  else return '70+';
  end if;
end;
$$;

create or replace function set_age_group()
returns trigger language plpgsql as $$
begin
  new.age_group := calc_age_group(new.age);
  return new;
end;
$$;

drop trigger if exists trg_set_age_group on participants;
create trigger trg_set_age_group
  before insert or update of age on participants
  for each row execute function set_age_group();

-- ============================================================
-- 6. LOCK IT DOWN — Row Level Security
-- ============================================================
alter table participants   enable row level security;
alter table race_events    enable row level security;
alter table timing_records enable row level security;
alter table app_settings   enable row level security;

-- Table-level privileges: the public (anon) role may only INSERT
-- registrations. Everything else it does through the safe functions below.
revoke all on participants, race_events, timing_records, app_settings from anon;
grant  insert on participants to anon;
grant  all on participants, race_events, timing_records, app_settings to authenticated;

-- --- Policies -------------------------------------------------
drop policy if exists participants_anon_insert on participants;
drop policy if exists participants_auth_all    on participants;
drop policy if exists race_events_auth_all      on race_events;
drop policy if exists timing_auth_all           on timing_records;
drop policy if exists app_settings_auth_all     on app_settings;

-- Public self-registration: insert only, with safe values enforced.
create policy participants_anon_insert on participants
  for insert to anon
  with check (
    waiver_accepted = true
    and race_number is null
    and coalesce(checked_in, false)           = false
    and coalesce(paid, false)                 = false
    and coalesce(received_bib, false)         = false
    and coalesce(exclude_from_results, false) = false
    and char_length(coalesce(first_name, '')) between 1 and 80
    and char_length(coalesce(last_name, ''))  between 1 and 80
    and char_length(coalesce(email, ''))      between 3 and 200
    and age between 1 and 120
  );

-- Organizer (signed in) has full access to everything.
create policy participants_auth_all on participants   for all to authenticated using (true) with check (true);
create policy race_events_auth_all  on race_events    for all to authenticated using (true) with check (true);
create policy timing_auth_all       on timing_records for all to authenticated using (true) with check (true);
create policy app_settings_auth_all on app_settings   for all to authenticated using (true) with check (true);

-- ============================================================
-- 7. Safe public-read functions (SECURITY DEFINER)
--    These let the public results page + TV clock read race data
--    WITHOUT exposing emails or the full roster. They only ever
--    return finishers and non-personal fields.
-- ============================================================
create or replace function public.get_race_state()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'start_ts',                (select ts from race_events where event_type = 'start' order by ts desc limit 1),
    'end_ts',                  (select ts from race_events where event_type = 'end'   order by ts desc limit 1),
    'results_released',        (select results_released from app_settings where id = 1),
    'clock_display_categories',(select clock_display_categories from app_settings where id = 1)
  );
$$;

create or replace function public.get_finishers()
returns table (
  timing_id   uuid,
  race_number integer,
  first_name  text,
  last_name   text,
  age         integer,
  age_group   text,
  gender      text,
  finish_time timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, p.race_number, p.first_name, p.last_name, p.age, p.age_group, p.gender, t.finish_time
  from timing_records t
  join participants p on p.id = t.participant_id
  where t.finish_time is not null
    and t.dnf = false
    and coalesce(p.exclude_from_results, false) = false
  order by t.finish_time asc;
$$;

revoke all on function public.get_race_state() from public;
revoke all on function public.get_finishers() from public;
grant execute on function public.get_race_state() to anon, authenticated;
grant execute on function public.get_finishers() to anon, authenticated;

commit;

-- ============================================================
-- 8. AFTER RUNNING THIS: create your organizer login
-- ------------------------------------------------------------
-- The organizer app now uses real Supabase Auth. Create an account:
--   Supabase Dashboard → Authentication → Users → "Add user"
--   • enter your email + password
--   • enable "Auto Confirm User"
-- Then log in at /login with that email + password.
-- ============================================================
