# GalaxyVPN

VPN subscription platform. Three parts:

| Folder / repo | What it is |
|---------------|------------|
| `galaxyvpn/` (this) | **Next.js** web app — landing, plans, payment, profile, support, admin. |
| `galaxyvpn/worker/` | **Tester Worker** — pulls server links from GitHub repos, tests them, syncs the `servers` table in Supabase. |
| `../hiddify/` | **Modified Hiddify** app — admin tool to manage the GitHub repos (the "+" → "GitHub" method). |

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind · next-intl (ru/en/ar) · Supabase (Postgres + Auth + Realtime).

## Local dev
```bash
npm install
cp .env.example .env.local   # fill keys (see SETUP.md)
npm run dev                  # http://localhost:3000
```

## Setup & keys
See [SETUP.md](SETUP.md) for Supabase + Google OAuth configuration and the
required environment variables.

## Deploy
[`render.yaml`](render.yaml) is a Render Blueprint defining the web service and
the background worker. Set the secret env vars in the Render dashboard.

## Database
The full schema (tables, RLS, triggers, views, realtime) lives in
[`supabase/schema.sql`](supabase/schema.sql) — run it in the Supabase SQL Editor.
