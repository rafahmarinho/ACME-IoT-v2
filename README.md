# ACME IoT

Building-intelligence platform for organizations → buildings → rooms → devices.
One Expo (React Native + Expo Router + TypeScript) app runs on **Android, iOS and web**,
backed by **Supabase** (Postgres, email/password auth, storage, realtime) and a
**TypeScript API on Vercel** that simulates device communication over HTTP (no MQTT broker).

| Area | What you get |
| --- | --- |
| Auth | Sign in, sign up, password recovery (email link → reset screen), sign out |
| Navigation | Sidebar on wide screens, bottom tabs on phones, organization switcher, menu filtered by role |
| Dashboard | KPIs, live 3D room twin, attention list, alerts, 24 h temperature trend, activity |
| Buildings & rooms | Search, create/edit/delete, floor grouping, room conditions, 3D/plan view with heatmap |
| Devices | Search + filters (status, type, building) + sort, cards, detail with **desired vs reported** state, thermostat setpoint/mode, plug on/off, readings charts, command history, events |
| Add device | QR scan (camera) or manual claim code, verified against the factory registry |
| Automations | Condition → action rules (notify, set temperature, switch plug), cooldown, enable/disable, run history |
| Alerts / events / notifications | Acknowledge & resolve, filters, audit trail, realtime toasts, notification center |
| Firmware | Releases, staged rollouts with progress, offline pause, automatic rollback on failed verification, manual rollback |
| Integrations | Slack, Teams, webhook, email, PagerDuty — simulated deliveries with status codes and latency |
| Team | Members, role changes, invitations (auto-accepted on sign-up), role reference |
| Simulation lab | Scenarios, advance time, live mode, device faults (disconnect, drain/replace battery), demo QR codes, reset data |
| Profile & settings | Avatar upload (Supabase Storage), personal details, password, °C/°F, alert preferences, refresh rate, org settings |

Roles: **owner, admin, operator, viewer** — enforced by Postgres RLS, by the API and in the UI.

| Capability | Owner | Admin | Operator | Viewer |
| --- | :-: | :-: | :-: | :-: |
| View everything | ✓ | ✓ | ✓ | ✓ |
| Control devices, ack alerts, edit automations, run simulation | ✓ | ✓ | ✓ | |
| Manage spaces/devices, firmware, integrations, team, reset demo | ✓ | ✓ | | |
| Manage other owners | ✓ | | | |

## Repository layout

```
apps/
  mobile/                 Expo app (Android, iOS, web)
    src/app/              Screens (Expo Router): (auth)/…, (app)/…
    src/components/       ui/, devices/, room3d/ (three.js scene), navigation/, spaces/
    src/services/         db.ts (Supabase data access), device-api.ts (Vercel API)
    src/providers/        Auth, Org (role + permissions), Realtime, Toast
    src/hooks/queries.ts  TanStack Query hooks (offline cache, polling)
    src/lib/              supabase client, api client, permissions, formatting
  api/                    Vercel functions (TypeScript)
    api/**.ts             One file per endpoint (POST + CORS)
    src/services/         devices, simulation, automations, firmware, notify
    src/dev-server.ts     Local server exposing the same handlers
supabase/
  migrations/             Schema, RLS, realtime, storage, reset_demo_data()
  seed.sql                Demo users + demo data
```

## Demo data

Two organizations and **20 devices** (thermostats, smart plugs, temperature, humidity and occupancy sensors):

* **Acme Corporation** — Acme HQ Tower (boardroom, open workspace, server room) and Innovation Lab — 12 devices
* **Bluefin Hotels** — Bluefin Harbor Hotel (lobby, suite, conference hall) — 8 devices

Plus 24 h of readings, automations with history, alerts, events, firmware releases/jobs,
integrations, notifications and 6 unclaimed devices to register.

All demo users share the password **`AcmeDemo!2026`**:

| Email | Role |
| --- | --- |
| owner@acme.test | Owner of Acme, Admin of Bluefin (shows org switching) |
| admin@acme.test | Admin of Acme |
| operator@acme.test | Operator of Acme, Viewer of Bluefin |
| viewer@acme.test | Viewer of Acme |
| owner@bluefin.test | Owner of Bluefin |

Unclaimed claim codes (QR codes are also shown on the Simulation screen):
`ACME-TH7Q-2K9X`, `ACME-SP4M-8RTZ`, `ACME-TS9D-3LWE`, `ACME-HS2B-6YQA`, `ACME-OS5N-1CVF`, `ACME-SP8H-4JKD`.

**Simulation → Reset demo data** (owner/admin) restores both organizations at any time.

## Run locally

Requirements: Node 22+, pnpm 10, Docker (for the local Supabase stack).

```bash
pnpm install
```

```bash
pnpm db:start
```

`db:start` applies the migrations and `seed.sql`, then prints the local URL and keys.

```bash
cp apps/api/.env.example apps/api/.env.local
```

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
```

Fill them in with the printed values: the API needs `SUPABASE_URL` and the **secret** key
(`SUPABASE_SECRET_KEY`), the app needs `EXPO_PUBLIC_SUPABASE_URL`, the **publishable** key and
`EXPO_PUBLIC_API_URL=http://localhost:3001`.

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open http://localhost:8081 and use one of the demo accounts. Password-reset emails land in
Mailpit at http://127.0.0.1:54324 when running locally.

Mobile on a device or emulator: run `pnpm dev:mobile` and open the project in a development
build (see below). On a physical phone set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL`
to your computer's LAN IP instead of `localhost`.

Useful commands: `pnpm typecheck`, `pnpm db:reset` (re-applies migrations + seed).

## Supabase (hosted)

1. Create a project at supabase.com (web and mobile share this one project).
2. Link and push the schema:
   ```bash
   pnpm exec supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   pnpm exec supabase db push
   ```
3. Load the demo data: open **SQL Editor**, paste `supabase/seed.sql` and run it.
4. **Authentication → URL configuration**: set Site URL to your web URL and add redirect URLs
   `https://YOUR-WEB.vercel.app/**`, `acmeiot://**` and `exp://**`.
5. Copy the project URL, the publishable key and the secret key from **Project Settings → API Keys**.

Realtime publications and the `avatars` / `building-photos` storage buckets are created by the migrations.

## Deploy to Vercel

Create **two Vercel projects** from the same Git repository.

**API** (`apps/api`)
* Root Directory: `apps/api` — framework preset “Other”. `vercel.json` already sets the install command.
* Environment variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CORS_ORIGINS` (your web URL, comma-separated, or `*`).
* Check: `https://YOUR-API.vercel.app/api/health`.

**Web app** (`apps/mobile`)
* Root Directory: `apps/mobile` — framework preset “Other”. `vercel.json` runs `expo export --platform web` and serves `dist` as an SPA.
* Environment variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_API_URL=https://YOUR-API.vercel.app`.

CLI alternative (from each app folder): `npx vercel link`, then `npx vercel --prod`.

## Android and iOS builds

The app uses native modules (camera, expo-gl for the 3D view), so use a development build
or EAS Build rather than Expo Go.

Local development build (Android Studio / Xcode installed):

```bash
pnpm --filter @acme/mobile android
```

```bash
pnpm --filter @acme/mobile ios
```

Store/installable packages with EAS (Expo account required). Set the production values of
`EXPO_PUBLIC_*` in `apps/mobile/eas.json` or as EAS environment variables first.

```bash
cd apps/mobile && npx eas-cli login && npx eas-cli build:configure
```

```bash
npx eas-cli build --platform android --profile preview
```

```bash
npx eas-cli build --platform ios --profile production
```

`preview` produces an installable Android APK; `production` produces an AAB / IPA for the
stores (`npx eas-cli submit`). Identifiers: `com.acme.iot`, URL scheme `acmeiot`.

## How the simulation works

* The app calls the API (`POST /api/devices/command`, `/api/simulation/tick`, …) with the user's Supabase JWT.
  The API checks membership and role, then reads/writes Postgres with the service key.
* A command stores the **desired state** immediately. Online devices acknowledge after a short simulated
  network round-trip and the **reported state** is updated; ~3 % time out. Offline devices keep the
  command queued and apply it on reconnect.
* Each simulation step (5 min of simulated time) updates physics (temperature toward setpoint, outdoor
  influence, humidity, occupancy, plug load), drains batteries, toggles connectivity, advances firmware jobs
  (download → install → verify, with automatic rollback), evaluates automations with cooldowns, raises
  alerts, notifies members and forwards to integrations.
* **Live mode** advances one step every 8 s from any foreground client (throttled server-side).

## Mobile behavior

* Last synced data is persisted (TanStack Query + AsyncStorage) and shown when offline, with an offline banner.
* Control actions are disabled offline; queries pause in the background and refetch on foreground/reconnect.
* Realtime channels close in the background and reopen (with a catch-up refetch) when the app returns.
* Forms use large touch targets, bottom-sheet pickers, steppers and keyboard-aware layouts.
