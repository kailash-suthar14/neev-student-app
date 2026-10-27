# Neev Survey (Expo / React Native)

A survey mobile app for iOS and Android built with Expo SDK 58, Expo Router and TypeScript (strict).

Flow: **branded splash → Firebase student sign-in (glsstudentapi) → home screen with the account details from `/api/accountInfo`**.

By default the app uses the **real sign-in**: Firebase Auth (`google-services.json`) plus the glsstudentapi backend, the same `/api/firebase-auth-token` and `/api/accountInfo` calls as the gls-student-client web app. A local `.env.local` must point `EXPO_PUBLIC_API_BASE_URL` at glsstudentapi.

> ⚠️ `EXPO_PUBLIC_DATA_MODE=mock` switches to an offline demo login for **development only**. It is not real authentication, and release builds refuse it.

## Prerequisites

- Node.js `^22.13.0` or `>=24` (React Native Testing Library 14 requires it). Tested with Node 24.
- npm 10 or later.
- One of:
  - iOS: Xcode with an iOS Simulator (macOS only).
  - Android: Android Studio with an emulator.
  - A physical Android device with USB debugging.

The app uses native Firebase and Google Sign-In modules, so it runs as a **development build** (`npx expo run:android`), not in Expo Go.

## Install

```bash
npm install
cp .env.example .env.local   # optional; defaults work without it
```

## Run

```bash
npx expo run:android  # build and install the development build (first time, or after native changes)
npx expo start        # then press a to open it
```

Android uses package `com.deeple.testApp` from `google-services.json` (Firebase project `deeple-80bdf`). iOS is not configured yet: it needs `GoogleService-Info.plist` set as `ios.googleServicesFile` in `app.json`.

Demo login (only with `EXPO_PUBLIC_DATA_MODE=mock`):

| Email              | Password   |
| ------------------ | ---------- |
| `demo@example.com` | `Demo123!` |

Change these with `EXPO_PUBLIC_DEMO_EMAIL` and `EXPO_PUBLIC_DEMO_PASSWORD`.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint src tests (ESLint, including architecture-boundary rules)
npm test              # Jest (jest-expo) + React Native Testing Library
npm run check         # all three
```

## Configuration

All configuration comes from `EXPO_PUBLIC_*` environment variables. They are validated at startup in `src/config/env.ts`. See [`.env.example`](.env.example).

| Variable                      | Default            | Notes                                     |
| ----------------------------- | ------------------ | ----------------------------------------- |
| `EXPO_PUBLIC_APP_NAME`        | `Neev Survey`      | Shown on splash, login and header         |
| `EXPO_PUBLIC_DATA_MODE`       | `rest`             | `rest` (real sign-in) or `mock` (dev demo) |
| `EXPO_PUBLIC_API_BASE_URL`    | –                  | Required in `rest` mode                   |
| `EXPO_PUBLIC_API_TIMEOUT_MS`  | `15000`            | REST timeout                              |
| `EXPO_PUBLIC_MOCK_LATENCY_MS` | `400`              | Simulated latency in mock mode            |
| `EXPO_PUBLIC_DEMO_EMAIL`      | `demo@example.com` | Mock login only                           |
| `EXPO_PUBLIC_DEMO_PASSWORD`   | `Demo123!`         | Mock login only                           |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | deeple-80bdf web client | Google Sign-In (REST mode)           |

`EXPO_PUBLIC_*` values are inlined into the JS bundle. Never put secrets in them. Restart the dev server after changing them; add `--clear` if a value seems stale.

**Release builds** (`__DEV__` false) refuse mock mode and reject `http://` API URLs.

## Firebase sign-in (REST mode)

In REST mode the login works like the mentor app's. The student signs in with Firebase (email/password, or Google on Android), the app exchanges the Firebase ID token at glsstudentapi's `/api/firebase-auth-token` for an `X-Auth-Token` (kept in `expo-secure-store`), and then loads `/api/accountInfo`. Only accounts with the **student** role are accepted. glsstudentapi rejects other roles, and the app checks `roles` as well.

1. Point the app at glsstudentapi (the host only; paths already start with `/api`) in `.env.local`:
   ```bash
   EXPO_PUBLIC_DATA_MODE=rest
   EXPO_PUBLIC_API_BASE_URL=http://<student-api-host>:<port>
   ```
2. Restart `npx expo start --clear`.

Google Sign-In needs this build's SHA-1 registered for `com.deeple.testApp` in the Firebase console, followed by a fresh `google-services.json`. Until then it fails with "Google Sign-In configuration error". Email/password works without it.

The survey and submission REST endpoints are still a proposed contract ([docs/backend-api-contract.md](docs/backend-api-contract.md)). The composition root, `src/config/container.ts`, is the only place that chooses between implementations. See [docs/architecture.md](docs/architecture.md) for details.

## Project layout

```
src/app/            Expo Router routes (root layout, login, (app) group)
src/components/     Reusable presentational UI
src/features/       auth + surveys: models, validation, services, hooks
src/data/           repositories (interfaces), local (AsyncStorage), mock, remote (REST)
src/config/         env parsing, composition root, services context
src/core/           errors, clock/id helpers, serial queue
src/theme/          design tokens
tests/              unit + integration tests
docs/               architecture, API contract, testing
```

## Documentation

- [docs/architecture.md](docs/architecture.md): layers, data flow, persistence and security notes.
- [docs/backend-api-contract.md](docs/backend-api-contract.md): the proposed REST endpoints.
- [docs/testing.md](docs/testing.md): automated and manual testing.
