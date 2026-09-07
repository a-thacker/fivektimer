-- ============================================================
-- HARDEN THE PUBLIC-REGISTRATION RLS POLICY
-- Run this once in the Supabase SQL Editor.
--
-- The public (anon) role can INSERT registrations. The original policy
-- bounded first/last name, email, and age, but left phone, emergency
-- contact, student id, allergies, guardian name, and the signature
-- unbounded. A script hitting the REST API directly (bypassing the
-- browser form) could therefore store megabyte-sized blobs or junk in
-- those fields to bloat the table and run up storage cost.
--
-- This replaces the policy with one that bounds EVERY field. It changes
-- no other behavior: the browser form already stays well inside these
-- limits. (Fresh installs from supabase_setup.sql / migration.sql now
-- include these bounds too — this file is for databases created earlier.)
-- ============================================================

drop policy if exists participants_anon_insert on participants;

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
