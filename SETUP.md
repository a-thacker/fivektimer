# 5KTimer — Setup Guide

A standalone race timing app for 5K runs, built on the same foundation as TriTimer but simplified to a single Start → Finish checkpoint, with optional team support and automatic age-group categorization.

This is a **completely separate project** from TriTimer — its own Supabase database, its own Netlify deploy, its own URL.

---

## What's different from TriTimer

| | TriTimer | 5KTimer |
|---|---|---|
| Race stages | Swim/T1/Bike/T2/Run | Start → Finish only |
| "Got swag" field | Swag bag | **Received Bib** |
| Race types | Kids + Adult (two races) | One race |
| Results | Top 3 overall/men/women/teams | Same, **plus optional age groups** |
| Team roles | Swimmer/Biker/Runner | Free-text role/note (optional) |

Everything else — registration, check-in, sort/filter, the search-to-time-checkpoint workflow, results release gating, save-card downloads, the TV clock, polling sync for two operator devices, RESET-typing safety on race reset — is carried over identically.

---

## Step 1 — Create a NEW Supabase Project

This must be a **separate** Supabase project from your TriTimer one.

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it something like `5ktimer`
3. Save your database password
4. Wait ~2 minutes for it to spin up

## Step 2 — Run the Setup SQL

1. Open **SQL Editor** in your new Supabase project
2. Paste the entire contents of `supabase_setup.sql`
3. Click **Run**

This creates `participants`, `race_events`, `timing_records`, and `app_settings`, plus a database trigger that **automatically calculates each runner's age group** whenever their age is set or changed. You never have to set age group manually.

## Step 3 — Get Your API Keys

Settings → API → copy your **Project URL** and **anon public** key.

## Step 4 — Local Setup

```bash
cd fivektimer
npm install
cp .env.example .env
```

Fill in `.env`:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ORGANIZER_PASSWORD=choose-a-password
```

Test locally:
```bash
npm run dev
```

## Step 5 — Deploy to Netlify

Same as before:
```bash
npm run build
```
Drag the `dist/` folder to [app.netlify.com](https://app.netlify.com), then add your three environment variables in **Site Settings → Environment Variables** and trigger a redeploy.

This will be a **different Netlify site** with its own URL — e.g. `5ktimer.netlify.app` — separate from your triathlon site.

---

## Page Reference

| Page | URL |
|---|---|
| Landing | `/` |
| Public results | `/results` |
| Organizer login | `/login` |
| Dashboard | `/app` |
| Registration | `/app/register` |
| Participants | `/app/participants` |
| Check-In | `/app/checkin` |
| Race Timing | `/app/timing` |
| Live Results (organizer) | `/app/results/live` |
| Final Results (organizer) | `/app/results/final` |
| Print | `/app/results/print` |
| Edit Times | `/app/results/edit-times` |
| TV Clock | `/clock` (no login needed) |

---

## Age Groups

Auto-calculated brackets: **14 & Under, 15-19, 20-29, 30-39, 40-49, 50-59, 60-69, 70+**

They appear as a collapsible section at the bottom of Final Results (organizer) and within the Final tab on the public results page. If you never care about age groups for a given race, just don't mention them — they sit quietly at the bottom and don't affect anything else.

## Teams

Works exactly like TriTimer: register each team member separately, give them the same team color, and they'll automatically share one race number and one shared finish time. The "Role / Note" field is free text (e.g. "Captain", "Leg 1") since 5K team formats vary — it's just a label, not functional logic.

If you never use teams for a given 5K, just leave Team Entry unchecked for everyone and the team UI never appears in timing or results.

---

## Operating on Race Day

Identical workflow to TriTimer's Kids Race page:
1. Check people in
2. Click **Start Race**
3. Type a race number, press Enter (or tap Mark Finished) as each person crosses
4. Click **End Race** when done — review the warning list of anyone still unfinished
5. Go to Final Results → **Release Results** to make them visible to participants
6. Point a TV or Roku browser at `/clock` for a live race clock display
