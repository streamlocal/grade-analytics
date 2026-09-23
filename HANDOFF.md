# Handoff — Grade Analytics

Private Canvas grade tracker. **Frontend on GitHub Pages + Supabase backend.**
This document is safe to commit (contains **no secret values**, only where they live).

## Identity / URLs

| Thing | Value |
| --- | --- |
| Repo | https://github.com/streamlocal/grade-analytics (public) |
| Live site | https://streamlocal.github.io/grade-analytics/ |
| Supabase project ref | `htyloqknzbovojsijamf` (region us-west-2) |
| Supabase URL | https://htyloqknzbovojsijamf.supabase.co |
| Supabase org | `rmkbyyqfuhsczqgimbuk` |
| LMS | Canvas — https://saintignatius.instructure.com |
| Account | akuszewski28@student.ignatius.edu |

## Architecture

```
Browser (GitHub Pages, React+Vite+TS)
  ├─ Supabase JS: anon key + Auth session (localStorage)
  ├─ RLS-guarded reads (courses, assignments, snapshots, events…)
  └─ fetch → Edge Functions (JWT in Authorization header)
                 │
Supabase Edge Functions (Deno) ── decrypt Canvas token (AES-GCM, key in secrets)
                 │                 └─ Canvas REST API
Supabase Postgres (RLS, pg_cron) ─ snapshots + change detection + daily schedule
```

- **Only** the Supabase **anon/publishable** key is in the frontend. The **service_role**
  key never leaves the server.
- The **Canvas token** is never in the frontend/localStorage/repo. It is entered in the UI,
  POSTed to `lms-connect`, AES-GCM encrypted, and stored in `public.lms_credentials`
  (no grants to anon/authenticated, no RLS policy → only service_role/Edge Functions can read it).
  The browser only ever sees `••••last4` + last-verified.

## Frontend (`src/`)

```
main.tsx / App.tsx        HashRouter, AuthProvider, Setup gate, theme toggle
components/ui.tsx         Card, Skeleton, Empty, TopBar (NavLink active highlighting)
charts/charts.tsx         Sparkline, HistoryChart, MultiLineChart (+ SERIES_COLORS)
hooks/AuthContext.tsx     session restore, remember-device, sign out
hooks/useData.ts          useCourses/useSnapshots/useAssignments/useActivity/useLastSync
services/supabaseClient.ts live-binding client, makeClient, refreshAuthClient
services/api.ts           authedInvoke() wrapper for Edge Functions
utils/gpa.ts              Saint Ignatius quality points, overallGpa, letterGrade, effectiveScore
utils/format.ts           fmtPct/fmtDate/delta/scoreAt/isSubmitted/letterFor
models/types.ts           Course, Assignment, CourseSnapshot, ActivityEvent, SyncRun
pages/                    Login, Setup, Dashboard, CourseDetail, History, Assignments, Compare, WhatIf, Settings
```

Routes: `/` Dashboard · `/history` · `/assignments` · `/compare` · `/what-if` · `/settings` · `/course/:id`.

### Commands

```bash
npm i
npm run dev      # local dev (needs .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
npm test         # vitest (GPA + formatting unit tests)
npm run build    # tsc --noEmit && vite build
```

`vite.config.ts` base = `process.env.VITE_BASE || '/grade-analytics/'`.
Deploy workflow sets `VITE_BASE=/${{ github.event.repository.name }}/`.

## Backend — Edge Functions (`supabase/functions/`)

| Function | verify_jwt | Purpose |
| --- | --- | --- |
| `lms-connect` | yes | save / `status` / `delete` the encrypted Canvas credential |
| `lms-test` | yes | verify stored credential against Canvas |
| `sync` | yes | `discover` \| `set-tracked` \| `sync` (full). Service-role may pass `{for_user}` |
| `cron-trigger` | **no** | `CRON_SECRET` bearer → fan-out sync for every connected account |
| `export-data` | yes | JSON export of the user's rows + masked connection |
| `delete-data` | yes | delete all rows + credential |
| `user-sessions` | yes | list (current only) / `revoke-all` (global sign out) |

`_shared/`: `auth.ts` (adminClient, requireUser, json+CORS, AES-GCM), `cors.ts` (preflight),
`detect.ts` (change detection + normalizers), `providers/canvas.ts`, `providers/types.ts`.

### Deploy / secrets

```bash
supabase link --project-ref htyloqknzbovojsijamf
supabase db push                                   # migrations
supabase secrets set CREDENTIAL_ENCRYPTION_KEY=<32B base64> CRON_SECRET=<random>
supabase functions deploy sync lms-connect lms-test cron-trigger export-data delete-data user-sessions
```

## Database (`supabase/migrations/`)

`0001_schema` · `0002_cron` (template) · `0003_course_level` · `0004_score_override`
· `0005_course_categories` · `0006_submitted_override`

Tables (all RLS-scoped to `auth.uid()` except `lms_credentials`):
`profiles`, `lms_credentials` (**deny client**), `courses`, `course_snapshots`,
`assignments`, `assignment_snapshots`, `sync_runs`, `activity_events`, `user_settings`.

Useful columns: `courses.level` (Regular/Honors/AP/Free), `courses.score_override`,
`courses.categories` (jsonb `[{name,weight}]` from Canvas), `assignments.submitted_override`
(`null`=Canvas, `true`/`false`=manual).

**Daily sync:** pg_cron job `grade-analytics-daily-sync`, `0 11 * * *` (UTC; 7 AM ET / 6 AM EST),
calls `net.http_post` → `cron-trigger`. Runs on Supabase's servers (your PC not needed).

## Security model

- RLS on every user table keyed to `auth.uid()`. Verified: cross-user reads return nothing,
  forging another user's row is rejected, `lms_credentials` returns **403** to clients.
- Edge Functions verify the caller's JWT (except `cron-trigger`, guarded by `CRON_SECRET`).
- Only the Supabase Auth session is in localStorage. Grade data is never in the repo/build.
- `sync` upserts never touch `score_override` / `submitted_override`, so manual edits survive.
- One sync per user at a time (partial unique index on `sync_runs` where `status='running'`);
  stale locks older than 15 min are auto-reclaimed.

## Saint Ignatius GPA rules (implemented in `src/utils/gpa.ts`)

Percentage → base quality points: 100–98→4.3, 97→4.2 … 65→1.0, below 65→0.
Honors **+0.25**, AP / dual-credit / AP-prerequisite **+0.5**, Regular +0.
**Free periods excluded** (not averaged as 0). Letters A+ … D−, F (A:90–100, B:80–89, C:70–79, D:65–69, F:<65).
No class rank is published. Course level is auto-detected from the name on first insert, then user-editable.

## Canvas provider

Base `https://saintignatius.instructure.com`, `Authorization: Bearer <token>`:
- `/api/v1/users/self`
- `/api/v1/courses?enrollment_state=active&enrollment_type=student&include[]=teachers&include[]=total_scores&per_page=100`
- `/api/v1/courses/:id/assignments?per_page=100&include[]=submission`
- `/api/v1/courses/:id/students/submissions?student_ids[]=self&per_page=100&include[]=assignment`
- `/api/v1/courses/:id/assignment_groups?per_page=100` (category names + `group_weight`)

Normalized into `NormCourse` / `NormAssignment` / `NormCategory` so other LMS providers can be added.

## GitHub workflows (`.github/workflows/`)

- `deploy-pages.yml` — on push to `main`: npm ci → test → build (with `VITE_SUPABASE_*` secrets) → deploy Pages.
- `daily-sync.yml` — daily 12:00 UTC + `workflow_dispatch` → POST `cron-trigger` with `CRON_SECRET`.

## Secrets — where they live (values NOT in this repo)

| Source | Name | Notes |
| --- | --- | --- |
| Supabase → Project Settings → Edge Function Secrets | `CREDENTIAL_ENCRYPTION_KEY` | 32-byte base64; decrypts the Canvas token. **If lost, re-set it and re-connect Canvas.** |
| Supabase Edge Function Secrets | `CRON_SECRET` | bearer for `cron-trigger` |
| GitHub → repo → Settings → Secrets and variables → Actions | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | public frontend config (anon only) |
| GitHub repo secrets | `SUPABASE_URL`, `CRON_SECRET` | backup daily-sync trigger |
| Supabase → Project Settings → API | `anon` (public) + `service_role` (server only) | anon is safe to expose; service_role is not |

## Known caveats / follow-ups

- Canvas token: rotate it (it was shared in plaintext during setup). Re-enter via Setup → Save & test.
- Supabase free tier pauses a project after ~7 days of inactivity; the daily sync normally prevents this.
- Daily cron is UTC: 7 AM ET now, 6 AM ET after DST ends.
- Email auto-confirm is ON (single-user app). If more users are ever needed, add real email + disable open signup.
- `user-sessions` only reports the current session (Supabase Auth has no per-session list API for end users).
