# Family Vitals

A calm, dark, nocturnal health tracking app for families. Log blood pressure, pulse, and blood sugar, then share them inside a household.

## Features

- Sign in and sign up with Supabase Auth
- Personal dashboard with the latest BP, pulse, and blood sugar
- Family view with each member's latest vitals
- Reading history with delete
- Admin panel for the first registered user: families, member assignment, registration toggle

## Tech stack

- Frontend: vanilla ES modules, HTML, CSS
- Backend: Supabase (Auth, Postgres, RLS)
- PWA: `manifest.json` + service worker
- Python: validation and export helpers

## Getting started

### 1. Apply the database migrations

The UI will not work until the database exists. Fastest path: paste `supabase/setup.sql` into the Supabase SQL editor and run it.

Or run the numbered files in `supabase/migrations/` in order, or `supabase db push` if you use the CLI.

The first account that is created becomes a super admin. To promote an existing user later:

```sql
UPDATE public.profiles
SET is_super_admin = true
WHERE email = 'you@example.com';
```

### 2. Confirm the Supabase client

Credentials live in `js/services/supabaseClient.js`. The publishable/anon key is safe to ship in the browser. Change the URL and key if you point the app at a different project.

### 3. Serve the app over HTTP

ES modules will not load from `file://`. From the project root:

```bash
python -m http.server 4173
```

Then open http://localhost:4173

### Python scripts

```bash
cd python
pip install -r requirements.txt

python validate_readings.py readings.json
python export_readings.py export readings.csv
python export_readings.py check-orphaned
python export_readings.py admin-report admin-report.json
python export_readings.py backfill readings.json
```

Override the API target with `FAMILY_VITALS_SUPABASE_URL` and `FAMILY_VITALS_SUPABASE_KEY` if needed.

## Design

See `design.md`. The UI stays monochrome and nocturnal: forest-black surfaces, white type, and status color only on reading chips.
