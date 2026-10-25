# Neev Survey (Expo / React Native)

A survey mobile app for iOS and Android built with Expo SDK 58, Expo Router and TypeScript (strict).

Flow: **branded splash → mock login → survey landing → validated submission → saved-submission summary**.

By default the app runs in **mock mode**. It works fully offline and stores data on the device with AsyncStorage. REST repositories for a future backend are included as tested placeholders.

> ⚠️ Mock sign-in is for **development only**. It checks configurable demo credentials and is not real authentication.

## Prerequisites

- Node.js `^22.13.0` or `>=24` (React Native Testing Library 14 requires it). Tested with Node 24.
- npm 10 or later.
- One of:
  - iOS: Xcode with an iOS Simulator (macOS only).
  - Android: Android Studio with an emulator.
  - A physical device with [Expo Go](https://expo.dev/go). This app uses only modules bundled in Expo Go.

## Install

```bash
npm install
cp .env.example .env.local   # optional; defaults work without it
```

## Run

```bash
npx expo start        # then press i (iOS) or a (Android), or scan the QR code
npm run ios           # same as expo start --ios
npm run android       # same as expo start --android
```

Demo login (mock mode):

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
| `EXPO_PUBLIC_DATA_MODE`       | `mock`             | `mock` or `rest`                          |
| `EXPO_PUBLIC_API_BASE_URL`    | –                  | Required in `rest` mode                   |
| `EXPO_PUBLIC_API_TIMEOUT_MS`  | `15000`            | REST timeout                              |
| `EXPO_PUBLIC_MOCK_LATENCY_MS` | `400`              | Simulated latency in mock mode            |
| `EXPO_PUBLIC_DEMO_EMAIL`      | `demo@example.com` | Mock login only                           |
| `EXPO_PUBLIC_DEMO_PASSWORD`   | `Demo123!`         | Mock login only                           |

`EXPO_PUBLIC_*` values are inlined into the JS bundle. Never put secrets in them. Restart the dev server after changing them; add `--clear` if a value seems stale.

**Release builds** (`__DEV__` false) refuse to start unless `EXPO_PUBLIC_DATA_MODE` is set explicitly, and they reject `http://` API URLs. Set the mode in your EAS build profile's `env`.

## Switching from mock to REST

1. Agree the endpoint contract with the backend team. The proposed contract is in [docs/backend-api-contract.md](docs/backend-api-contract.md).
2. Set the following in `.env.local`:
   ```bash
   EXPO_PUBLIC_DATA_MODE=rest
   EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com/v1
   ```
3. Restart `npx expo start --clear`.

The composition root, `src/config/container.ts`, is the only place that chooses between implementations. Screens and services do not change. See [docs/architecture.md](docs/architecture.md) for the remaining production steps, such as secure token storage.

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
