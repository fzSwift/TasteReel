# TasteReel Mobile 

Role-based Expo app for food discovery, order flow, delivery pickup verification, and basic moderation.
This document is for developers working on code, schema, and environment setup.

## Stack and Runtime

- `expo@54`, `react-native@0.81`, `react@19`, TypeScript
- Navigation: React Navigation (native stack + bottom tabs)
- Backend: Supabase Auth + Postgres + Storage + RLS
- Device services: camera (`expo-camera`), location (`expo-location`), document picker
- Video: currently `expo-av` (deprecated upstream; migration planned)

## Repository Layout

- `src/context/AppContext.tsx`
  - central state and business logic
  - auth/session lifecycle
  - Supabase CRUD + RPC calls
  - location, order status transitions, menu upload logic
- `src/navigation/RootNavigator.tsx`
  - role-based tab trees
  - screen-level UI and actions
- `src/types.ts`
  - app domain types
- `utils/supabase.ts`
  - Supabase client bootstrapping
- `utils/cloudinary.ts`
  - optional Cloudinary upload helper
- `supabase/schema.sql`
  - canonical idempotent schema + RLS policies + grants
- `supabase/*.sql`
  - migration helpers and operational scripts

## Local Development

### Prerequisites

- Node 18+ and npm
- Expo Go or simulator/emulator
- Supabase project (for live mode)

### Install

```bash
npm install
```

### Environment

Copy `.env.example` to `.env.local` and set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`

Optional:

- `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- `EXPO_PUBLIC_CLOUDINARY_FOLDER`

Notes:

- Web upload path intentionally prefers Supabase storage to avoid browser tracking prevention issues with third-party media hosts.
- `EXPO_PUBLIC_OFFLINE_DEMO=1` enables mock/demo mode.

### Run Commands

```bash
npm run start
npm run start:tunnel
npm run web
npm run android
npm run ios
npm run demo
```

## Supabase Bootstrapping

Run SQL in this order:

1. `supabase/schema_enum_app_role_legacy.sql` (only if enum compatibility issue exists)
2. `supabase/schema.sql` (always; safe to rerun)
3. Optional:
  - `supabase/rpc_adjust_restaurant_like_count.sql`
  - `supabase/storage_menu_videos_public_access.sql`
  - `supabase/path-b-demo-roles.sql` (after editing emails)

After schema updates, force PostgREST schema refresh when needed:

```sql
NOTIFY pgrst, 'reload schema';
```

## Data Model (high level)

- `profiles`
  - source of truth for role
  - includes user metadata and location fields
- `restaurants`
  - moderation state + social counters
  - optional owner mapping for scoped restaurant role
- `menu_items`
  - linked to restaurant
  - `video_url` may be supabase public path/url, signed-resolved url, or legacy cloudinary url
- `order_tickets`
  - customer, restaurant, items payload, QR, status lifecycle
- `profile_change_requests`
  - customer initiated role requests, admin resolution

## Authorization Model

Security is enforced at two layers:

1. **UI guardrails** (role checks in app actions)
2. **RLS** in Supabase (actual permission boundary)

Do not rely on UI checks alone. Any new privileged mutation should include a matching policy validation path.

## Core Runtime Flows

### Auth/Profile

- On auth state change:
  - session sync
  - profile fetch/ensure
  - role sync from `profiles.role`

### Catalog Refresh

- bootstrap on load
- periodic signed-in refresh (profile/catalog/requests)
- fallback to mock when Supabase unavailable/misconfigured

### Order Lifecycle

- customer places order -> `pending`
- admin/restaurant accepts -> `accepted` + QR
- driver accepts -> `driver_accepted`
- driver scans customer QR -> `picked_up`

### Video Playback/Upload

- URL normalization for storage paths
- signed URL playback fallback in app context
- direct-open fallback in UI when embedded player fails
- web uploads prefer Supabase storage path

### Location

- GPS refresh with permission checks
- manual fallback setter
- profile location persistence when schema supports fields
- graceful fail-open when location columns are missing from live DB

## Developer Workflows

### Add a new screen/action

1. Add UI in `RootNavigator.tsx`
2. Add action/state in `AppContext.tsx`
3. Add/update domain types in `src/types.ts`
4. Add/adjust RLS and schema if backend mutation changes
5. Validate role checks in both UI and DB policy paths

### Add a new table/column

1. Update `supabase/schema.sql` idempotently (`add column if not exists`)
2. Update TS mapping functions in app context
3. Add guards for backward compatibility where needed
4. Run schema + cache refresh in Supabase

### Quality Gate

```bash
npx tsc --noEmit
```

## Known Technical Debt

- `expo-av` deprecation warning (migrate to `expo-video`)
- `RootNavigator.tsx` and `AppContext.tsx` are large; candidates for modularization
- web browser privacy settings can still affect third-party media URLs

## Troubleshooting

### Supabase 400 (`column not found`, schema cache errors)

- Re-run `supabase/schema.sql`
- `NOTIFY pgrst, 'reload schema';`
- reload app

### RLS permission denied

- verify role in `profiles`
- confirm policy exists in schema version currently deployed
- ensure environment points to expected Supabase project

### Video not playing

- inspect `[menu video]` / `[feed video]` logs
- verify storage object exists and is readable
- test with Chrome for web (tracking prevention can block third-party hosts)

### Metro/HMR disconnect

- restart dev server
- prefer tunnel mode on unstable networks

## EAS

Available scripts:

- `npm run eas:login`
- `npm run eas:configure`
- `npm run eas:build:android:preview`
- `npm run eas:build:ios:preview`

Use `EXPO_PUBLIC_*` vars in EAS environment with non-secret visibility type.