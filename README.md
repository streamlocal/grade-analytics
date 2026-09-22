# Grade Analytics (private, Canvas)

Private personal grade-analytics dashboard. Frontend: React + Vite on **GitHub Pages**.
Backend: **Supabase** (Auth, Postgres + RLS, Edge Functions, pg_cron). LMS: **Canvas**
(default host `https://saintignatius.instructure.com`), normalized so other providers can be added.

## Minimum secure architecture

- GitHub Pages serves **static UI only** — no secrets, no grade data in the repo or build output.
- The browser holds **only** the Supabase Auth session (+ anon key). `persistSession: true`,
  `autoRefreshToken: true`; "Remember this device" (default ON) controls persistence.
- The **Canvas token is never in frontend code, env vars, git, query params, localStorage,
  logs, or API responses**. The Settings form POSTs it to the `lms-connect` Edge Function,
  which validates it against Canvas, **AES-GCM encrypts** it (key = `CREDENTIAL_ENCRYPTION_KEY`
  Edge Function secret; Vault/pgsodium is an equivalent alternative), and stores the ciphertext
  in `lms_credentials` — a table with **no grants to anon/authenticated and no read RLS policy**
  (service_role / Edge Functions only). The browser receives only `••••last4` metadata.
- Grade tables all have **RLS scoped to `auth.uid()`**. Edge Functions verify the user JWT
  (`requireUser`) except `cron-trigger`, which uses `CRON_SECRET` and fans out per user with
  the stored encrypted credential (no session needed).

## GPA (Saint Ignatius scale)

Percentage → base quality points: 100–98 → 4.3, 97 → 4.2 … 65 → 1.0, below 65 → 0.
Bumps: Honors **+0.25**, AP / dual-credit / AP-prerequisite **+0.5**, Regular +0.
**Free periods are excluded** from GPA (not averaged as 0). Letters run **A+ → D−, F**
(A: 90–100, B: 80–89, C: 70–79, D: 65–69, F: <65). Set each class level on the
Compare page or Course page. No class rank is published — GPA shown is personal only.

## Repo layout

```
src/            pages/ charts/ services/ hooks/ models/ utils/ (gpa.ts, format.ts)
supabase/
  migrations/   0001_schema.sql  0002_cron.sql  0003_course_level.sql
  functions/    sync/ lms-connect/ lms-test/ cron-trigger/
                export-data/ delete-data/ user-sessions/
                _shared/ (auth, detect, providers/canvas)
.github/workflows/ deploy-pages.yml  daily-sync.yml
```

## Setup

### 1. Supabase project

1. Create a project at supabase.com. Enable email+password auth.
2. `npm i -g supabase`, then `supabase link --project-ref <REF>`.
3. Push migrations: `supabase db push` (applies 0001–0003).
4. Create a 32-byte encryption key and set secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   supabase secrets set CREDENTIAL_ENCRYPTION_KEY=<base64> CRON_SECRET=<random-long-string>
   ```
5. Deploy functions:
   ```bash
   supabase functions deploy sync lms-connect lms-test cron-trigger export-data delete-data user-sessions
   ```
6. Schedule daily sync: open the SQL editor and run the `cron.schedule(...)` block in
   `supabase/migrations/0002_cron.sql` with your `<PROJECT_REF>` and `<CRON_SECRET>`.

### 2. Frontend (GitHub Pages)

1. Create the repo and set secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (anon/publishable key **only** — never the service_role key).
2. For the backup daily trigger also set `SUPABASE_URL` + `CRON_SECRET` secrets.
3. Push to `main`. `deploy-pages.yml` installs, tests, builds with
   `VITE_BASE=/<repo-name>/`, and deploys to Pages. Enable Pages → Source: GitHub Actions.
4. Hash routing (`HashRouter`) is used so SPA routes work under `/<repo>/`.

Local dev: copy `.env.example` → `.env`, fill values, `npm i && npm run dev`.

### 3. First launch

Sign in (session persists per device) → Setup asks for Canvas URL
(default `https://saintignatius.instructure.com`) + API token
(Canvas → Account → Settings → New Access Token) → Test → select courses →
first sync → dashboard. Set each course's level (Regular/Honors/AP/Free) on
Compare for correct GPA.

## Verification checklist

Reload/restart keeps you signed in; incognito requires login; masked token only
(`••••83F2` + last-verified date); two syncs show grade/assignment events;
`Sync Now` locks concurrent runs; failed syncs keep last good data; sign-out
returns to login; cross-user reads rejected by RLS; no raw token in repo,
`dist/`, query params, localStorage, or client-readable responses
(`rg -i "token|secret" dist/` should show nothing sensitive).
