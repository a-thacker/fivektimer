-- ============================================================
-- 5K RACE — SUPABASE SETUP (fresh install)
-- Run this entire file in your Supabase SQL Editor.
--
-- One race. No teams, no t-shirts. Public self-registration is locked
-- down with Row Level Security: the anon key can only INSERT sign-ups
-- and can never read anyone's data. Public results/clock read through
-- safe SECURITY DEFINER functions. The organizer app signs in with
-- Supabase Auth.
--
-- (If you already have a 5KTimer database with data, run migration.sql
--  instead — it converts your existing schema in place.)
-- ============================================================

-- 1. PARTICIPANTS
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  race_number integer,                    -- assigned by organizer at check-in (public sign-ups start null)
  first_name text not null,
  last_name text not null,
  email text,
  age integer,
  age_group text,                         -- auto-calculated by trigger
  gender text check (gender in ('male','female','other')),
  registration_date date not null default current_date,
  checked_in boolean not null default false,
  paid boolean not null default false,
  received_bib boolean not null default false,
  exclude_from_results boolean not null default false,
  waiver_accepted boolean not null default false,
  waiver_accepted_at timestamptz,
  signature text,                         -- drawn waiver signature (PNG data URL)
  student_id text,                        -- optional (Southern student ID)
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  address text,
  city_state_zip text,
  allergies text,                         -- allergies / limiting physical conditions
  guardian_name text,                     -- parent/legal guardian (participants under 18)
  photo_release_accepted boolean not null default false,  -- Individual Release Form (photo/media)
  created_at timestamptz not null default now()
);

-- 2. RACE EVENTS (start / end)
create table if not exists race_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('start','end','reset')),
  ts timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 3. TIMING RECORDS — one row per participant
create table if not exists timing_records (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  finish_time timestamptz,
  dnf boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_individual unique (participant_id)
);

-- 4. APP SETTINGS (single-row config)
create table if not exists app_settings (
  id integer primary key default 1,
  results_released boolean not null default false,
  clock_display_categories jsonb not null default
    '{"overall":true,"men":true,"women":true,"age_group":false}'::jsonb,
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict do nothing;

-- ============================================================
-- AGE GROUP AUTO-CALCULATION
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
create index if not exists idx_timing_participant        on timing_records(participant_id);
create index if not exists idx_events_event_type          on race_events(event_type);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table participants   enable row level security;
alter table race_events    enable row level security;
alter table timing_records enable row level security;
alter table app_settings   enable row level security;

revoke all on participants, race_events, timing_records, app_settings from anon;
grant  insert on participants to anon;
grant  all on participants, race_events, timing_records, app_settings to authenticated;

drop policy if exists participants_anon_insert on participants;
drop policy if exists participants_auth_all    on participants;
drop policy if exists race_events_auth_all      on race_events;
drop policy if exists timing_auth_all           on timing_records;
drop policy if exists app_settings_auth_all     on app_settings;

-- Public self-registration: insert only, safe values enforced.
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
    -- Bound every remaining free-text field so a direct API call can't
    -- store oversized blobs or junk. These match what the form allows.
    and char_length(coalesce(phone, ''))                   between 7 and 40
    and char_length(coalesce(emergency_contact_name, ''))  between 1 and 120
    and char_length(coalesce(emergency_contact_phone, '')) between 7 and 40
    and char_length(coalesce(student_id, ''))              <= 40
    and char_length(coalesce(allergies, ''))               <= 2000
    and char_length(coalesce(guardian_name, ''))           <= 120
    and char_length(coalesce(signature, ''))               <= 1000000
  );

-- Organizer (signed in) has full access.
create policy participants_auth_all on participants   for all to authenticated using (true) with check (true);
create policy race_events_auth_all  on race_events    for all to authenticated using (true) with check (true);
create policy timing_auth_all       on timing_records for all to authenticated using (true) with check (true);
create policy app_settings_auth_all on app_settings   for all to authenticated using (true) with check (true);

-- ============================================================
-- SAFE PUBLIC-READ FUNCTIONS (SECURITY DEFINER)
-- Return only finishers + non-personal fields — never emails/roster.
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

-- ============================================================
-- ORGANIZER LOGIN
-- Create your account in the dashboard:
--   Authentication → Users → Add user (enable "Auto Confirm User").
-- Then sign in at /login with that email + password.
-- ============================================================
