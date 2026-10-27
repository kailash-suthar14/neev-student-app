# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Survey app: Expo SDK 58, React Native 0.88, React 19, Expo Router, TypeScript strict, Zod 4.
Project rules live in `.claude/CLAUDE.md`. Expo-specific guidance is in `AGENTS.md`. Read both.

## Commands

```bash
npx expo start          # dev server (i = iOS, a = Android)
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint src tests
npm test                # jest (jest-expo + RNTL 14)
npm test -- tests/unit/survey-service.test.ts   # one file
npm test -- -t "name pattern"                   # tests matching a name
npm run check           # all of the above; run before declaring work done
npx expo install <pkg>  # always use this to add packages (SDK-compatible versions)
```

## Architecture (see docs/architecture.md)

- `src/app/`: Expo Router routes only. Root `_layout.tsx` builds services, restores the session behind a branded splash, and guards routes with `Stack.Protected`. The `(app)/` group requires sign-in.
- `src/components/`: presentational UI. It reads theme tokens through `useTheme()`.
- `src/features/<feature>/`: `models.ts` (Zod schemas plus inferred types), `validation.ts`, `*-service.ts` (business logic), and `use-*.ts` hooks or contexts that screens consume.
- `src/data/repositories/`: interfaces only. `src/data/{mock,local,remote}/` holds the implementations.
- `src/config/container.ts`: the **only** place that picks mock or REST (`EXPO_PUBLIC_DATA_MODE`).
- `src/core/`: `AppError` and codes, user-facing messages, clock and ID helpers, serial queue.
- `createAppServices(config, overrides)` exposes only `AuthService`, `AccountService` (`GET /api/accountInfo`, shown on the home screen) and `SurveyService` (via `src/config/app-services.tsx`). Tests inject `storage`, `fetchFn`, `clock` and `createId` through `ContainerOverrides`, not through module mocks.
- Drafts always use `LocalDraftRepository` on the device, in both mock and REST mode. Mock submissions and sessions are also persisted locally. Local stores serialize their writes with `createSerialQueue()`.
- `VersionedJsonStore` wraps each value in a `{ schemaVersion, data }` envelope. `read()` returns `ok`, `missing` or `corrupt` and does not throw on bad data. Callers handle `corrupt` by calling `quarantine()`, which moves the raw value to a timestamped key, and by reporting it through `onDataIssue`.
- REST (Firebase sign-in + glsstudentapi) is the default mode and needs `EXPO_PUBLIC_API_BASE_URL` (`.env.local`). Mock mode is opt-in for development and tests (`tests/setup-env.ts` sets it); release builds refuse it and reject `http://` API URLs. The survey REST contract is in `docs/backend-api-contract.md`.

## Conventions

- Screens and components must not import `@/data/*` or AsyncStorage, and must not call `fetch`. Features must not import concrete data modules. ESLint enforces both.
- Every failure is an `AppError` with a code. Show users `getUserMessage(error)`, never raw server text.
- Validate all external input with Zod: API responses (`api-types.ts`), stored JSON (`VersionedJsonStore`) and env (`config/env.ts`).
- Storage keys are `survey-app:v1:<name>` (`storage-keys.ts`). Change the stored shape only together with a migration.
- Never store passwords or tokens in AsyncStorage. The backend `X-Auth-Token` and device id go through `AuthCredentialStore`, which uses expo-secure-store (`SecureStorageKeys`, which use dots instead of colons).
- REST-mode auth is `FirebaseAuthRepository`, ported from the mentor app. It signs in with Firebase, exchanges the token at `/api/firebase-auth-token`, loads `/api/accountInfo`, and requires the `student` role. Native Firebase and Google modules sit behind `FirebaseAuthGateway`; only `firebase-native-gateway.ts` imports them, and it is `require`d lazily in REST mode so mock mode runs without them. Jest maps them to `tests/mocks/*`, and tests inject `FakeFirebaseAuth` (`tests/helpers/firebase.ts`) through `ContainerOverrides.firebaseAuth`.
- Native modules mean the app needs a development build (`npx expo run:android`), not Expo Go. Android package `com.deeple.testApp` must match `google-services.json`.
- Repositories resolve only after the write or server call is confirmed. No silent fallbacks.
- Button `onPress` handlers must not return promises (use `() => void doThing()`). RNTL 14 awaits returned promises.
- Tests: `tests/unit` and `tests/integration` (Jest `roots` is `tests/` only). RNTL 14 `render`, `fireEvent` and `act` are async, so `await` them. Use `renderRouter('src/app')` for flow tests. Inject failures with `jest.spyOn(AsyncStorage, …)`, which maps to `tests/mocks/async-storage.ts`. `tests/setup-env.ts` sets mock latency to 0. REST tests use the recording fake fetch in `tests/helpers/http.ts`.
- Add or update tests with every behaviour change.
- RNTL docs for the installed version are in `node_modules/@testing-library/react-native/docs/`.
- Mock-mode demo login: `demo@example.com` / `Demo123!`, which you can override with `EXPO_PUBLIC_DEMO_EMAIL` and `EXPO_PUBLIC_DEMO_PASSWORD`. After changing any `EXPO_PUBLIC_*` value, restart with `npx expo start --clear`.
