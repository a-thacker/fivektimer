# 5K Race — Setup Guide

A standalone race timing app for a single 5K run: one Start → Finish checkpoint,
automatic age-group categorization, a public self-registration page, live
results, and a TV clock display.

Rename the event in one place: `RACE_NAME` in `src/lib/utils.js`.

---

## Key facts

- **One race.** No race-type selection, no teams, no t-shirts.
- **Public registration** (`/register`) collects first/last name, email, age, gender,
  and a liability-waiver agreement. It never links to the organizer app.
- **Locked down.** Row Level Security is on. The public (anon) key can only
  *submit* registrations — it can never read emails or the roster. Public
  results/clock read through safe database functions. The organizer app signs
  in with real Supabase Auth.

---

## Step 1 — Create / open your Supabase project

Settings → API → copy your **Project URL** and **anon public** key.

## Step 2 — Run the SQL

Open **SQL Editor** and run one of:

- **Fresh project:** paste `supabase_setup.sql` and Run.
- **Existing 5KTimer database (has data):** back up first, then paste
  `migration.sql` and Run. It deletes kids-run data, removes the team/t-shirt/
  race-type columns, adds the email + waiver columns, and turns on Row Level
  Security.

## Step 3 — Create your organizer login

The organizer app uses Supabase Auth (no more shared password).

1. Supabase Dashboard → **Authentication → Users → Add user**
2. Enter your email + password and enable **Auto Confirm User**
3. Sign in at `/login` with that email + password

## Step 4 — Local setup

```bash
cd fivektimer
npm install
cp .env.example .env
```

Fill in `.env` (only two values now):
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Test locally:
```bash
npm run dev
```

## Step 5 — Deploy to Netlify

```bash
npm run build
```
Drag `dist/` to [app.netlify.com](https://app.netlify.com), add the two
environment variables in **Site Settings → Environment Variables**, and redeploy.

---

## Page Reference

| Page | URL | Access |
|---|---|---|
| Landing | `/` | public |
| Public registration | `/register` | public (share the QR to this) |
| Public results | `/results` | public |
| TV Clock | `/clock` | public |
| Organizer login | `/login` | — |
| Dashboard | `/app` | signed in |
| Registration (day-of) | `/app/register` | signed in |
| Participants | `/app/participants` | signed in |
| Check-In | `/app/checkin` | signed in |
| Race Timing | `/app/timing` | signed in |
| Live Results | `/app/results/live` | signed in |
| Final Results | `/app/results/final` | signed in |
| Edit Times | `/app/results/edit-times` | signed in |

---

## Public registration & donations

- The `/register` page ends with a **donation section** (suggested minimum $10,
  any amount welcome). Drop your real QR images into `/public` and set the
  `img` paths in `DONATION_METHODS` at the top of
  `src/pages/PublicRegistration.jsx`. The handles/labels are edited there too.
- The **waiver + privacy text** in that file is a general template.
  ⚖️ **Have your own legal counsel review it before the event.**
- Public sign-ups arrive **without a bib number**. Assign one at Check-In
  (the "Assign #" button) or when editing the participant.

## Age Groups

Auto-calculated brackets: **14 & Under, 15-19, 20-29, 30-39, 40-49, 50-59, 60-69, 70+**.
They appear as a collapsible section on Final Results (organizer) and in the
Final tab of the public results page.

---

## Operating on Race Day

1. Check people in (assign bib numbers to any public sign-ups)
2. Click **Start Race**
3. Type a race number, press Enter (or tap Mark Finished) as each person crosses
4. Click **End Race** when done — review the warning list of anyone still unfinished
5. Go to Final Results → **Release Results** to make them visible to participants
6. Point a TV/Roku browser at `/clock` for the live race clock display
