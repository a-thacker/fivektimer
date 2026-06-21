-- ============================================================
-- 5KTIMER — SUPABASE SETUP SCRIPT (v2 — two separate races)
-- Run this entire file in your Supabase SQL Editor
-- ============================================================
-- Two race types: 'trail' (5K Trail Race) and 'kids_run' (1 Mile Kid's Run).
-- These run as fully separate races, mirroring TriTimer's kids/adult model:
-- separate start/end, separate timing, separate results.
-- ============================================================

-- 1. PARTICIPANTS
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  race_number integer not null,
  first_name text not null,
  last_name text not null,
  age integer,
  age_group text, -- auto-calculated: '14 & Under','15-19','20-29','30-39','40-49','50-59','60-69','70+'
  race_type text not null check (race_type in ('trail','kids_run')),
  -- Below fields are kept for compatibility but are currently optional/unused per race format:
  gender text check (gender in ('male','female','other')),
  registration_date date not null default current_date,
  checked_in boolean not null default false,
  paid boolean not null default false,
  received_bib boolean not null default false,
  tshirt_size text,
  is_team boolean not null default false,
  team_color text,
  team_role text,
  exclude_from_results boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. RACE EVENTS (start / end / reset) — now per race_type
create table if not exists race_events (
  id uuid primary key default gen_random_uuid(),
  race_type text not null check (race_type in ('trail','kids_run')),
  event_type text not null check (event_type in ('start','end','reset')),
  ts timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 3. TIMING RECORDS — now per race_type
-- Individuals: one row per participant, keyed by participant_id
-- Teams: one row per team, keyed by team_color + race_type
create table if not exists timing_records (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade,
  team_color text,
  race_type text not null check (race_type in ('trail','kids_run')),
  finish_time timestamptz,
  dnf boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_individual unique (participant_id),
  constraint uq_team unique (team_color, race_type)
);

-- 4. APP SETTINGS (single-row config table) — release + clock categories now per race_type
create table if not exists app_settings (
  id integer primary key default 1,
  trail_results_released boolean not null default false,
  kids_run_results_released boolean not null default false,
  -- Which result categories to show on the TV/Roku race clock once released, per race.
  -- Shape: { trail: {overall,men,women,team,age_group}, kids_run: {...} }
  clock_display_categories jsonb not null default
    '{"trail":{"overall":true,"men":true,"women":true,"team":false,"age_group":false},
      "kids_run":{"overall":true,"men":true,"women":true,"team":false,"age_group":false}}'::jsonb,
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict do nothing;

-- ============================================================
-- MIGRATION — if you already have a v1 5KTimer database, run this
-- block instead of the create-table statements above.
-- ============================================================
-- alter table participants add column if not exists race_type text;
-- update participants set race_type = 'trail' where race_type is null;
-- alter table participants alter column race_type set not null;
-- alter table participants add constraint participants_race_type_check check (race_type in ('trail','kids_run'));
--
-- alter table race_events add column if not exists race_type text;
-- update race_events set race_type = 'trail' where race_type is null;
-- alter table race_events alter column race_type set not null;
-- alter table race_events add constraint race_events_race_type_check check (race_type in ('trail','kids_run'));
--
-- alter table timing_records add column if not exists race_type text;
-- update timing_records set race_type = 'trail' where race_type is null;
-- alter table timing_records alter column race_type set not null;
-- alter table timing_records add constraint timing_records_race_type_check check (race_type in ('trail','kids_run'));
-- alter table timing_records drop constraint if exists uq_team;
-- alter table timing_records add constraint uq_team unique (team_color, race_type);
--
-- alter table app_settings add column if not exists trail_results_released boolean not null default false;
-- alter table app_settings add column if not exists kids_run_results_released boolean not null default false;
-- update app_settings set trail_results_released = results_released where results_released is not null;
-- alter table app_settings drop column if exists results_released;
-- alter table app_settings alter column clock_display_categories set default
--   '{"trail":{"overall":true,"men":true,"women":true,"team":false,"age_group":false},
--     "kids_run":{"overall":true,"men":true,"women":true,"team":false,"age_group":false}}'::jsonb;
-- update app_settings set clock_display_categories =
--   '{"trail":{"overall":true,"men":true,"women":true,"team":false,"age_group":false},
--     "kids_run":{"overall":true,"men":true,"women":true,"team":false,"age_group":false}}'::jsonb
--   where not (clock_display_categories ? 'trail');

-- ============================================================
-- AGE GROUP AUTO-CALCULATION FUNCTION
-- ============================================================
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
-- INDEXES
-- ============================================================
create index if not exists idx_participants_race_number on participants(race_number);
create index if not exists idx_participants_race_type    on participants(race_type);
create index if not exists idx_participants_team         on participants(team_color);
create index if not exists idx_timing_participant         on timing_records(participant_id);
create index if not exists idx_timing_team                 on timing_records(team_color);
create index if not exists idx_timing_race_type             on timing_records(race_type);
create index if not exists idx_events_race_type              on race_events(race_type);

-- ============================================================
-- ROW LEVEL SECURITY — disabled for v1 (no auth)
-- ============================================================
alter table participants   disable row level security;
alter table race_events    disable row level security;
alter table timing_records disable row level security;
alter table app_settings   disable row level security;

-- ============================================================
-- DONE
-- ============================================================
