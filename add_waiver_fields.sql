-- ============================================================
-- ADD WAIVER / REGISTRATION FIELDS
-- Run this once in the Supabase SQL Editor if your database was
-- created before these fields were added to the sign-up page.
--
-- All columns are nullable and are NOT referenced by the public-insert
-- RLS policy, so no policy changes are required. (Fresh installs from
-- supabase_setup.sql already include these columns.)
-- ============================================================

alter table participants add column if not exists signature text;               -- drawn waiver signature (PNG data URL)
alter table participants add column if not exists student_id text;              -- optional Southern student ID
alter table participants add column if not exists phone text;
alter table participants add column if not exists emergency_contact_name text;
alter table participants add column if not exists allergies text;               -- allergies / limiting physical conditions
alter table participants add column if not exists guardian_name text;           -- parent/legal guardian (participants under 18)
