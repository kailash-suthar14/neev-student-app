# CLAUDE.md

Survey app: Expo SDK 58, React Native 0.88, React 19, Expo Router, TypeScript strict, Zod 4.
Project rules live in `.claude/CLAUDE.md`. Expo-specific guidance is in `AGENTS.md`. Read both.

## Commands

```bash
npx expo start          # dev server (i = iOS, a = Android)
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint src tests
npm test                # jest (jest-expo + RNTL 14)
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

## Conventions

- Screens and components must not import `@/data/*` or AsyncStorage, and must not call `fetch`. Features must not import concrete data modules. ESLint enforces both.
- Every failure is an `AppError` with a code. Show users `getUserMessage(error)`, never raw server text.
- Validate all external input with Zod: API responses (`api-types.ts`), stored JSON (`VersionedJsonStore`) and env (`config/env.ts`).
- Storage keys are `survey-app:v1:<name>` (`storage-keys.ts`). Change the stored shape only together with a migration.
- Never store passwords or tokens in AsyncStorage. REST tokens go through `TokenStore`, which is in memory today and should be secure-store for production.
- Repositories resolve only after the write or server call is confirmed. No silent fallbacks.
- Button `onPress` handlers must not return promises (use `() => void doThing()`). RNTL 14 awaits returned promises.
- Tests: `tests/unit` and `tests/integration`. RNTL 14 `render`, `fireEvent` and `act` are async, so `await` them. Use `renderRouter('src/app')` for flow tests. Inject failures with `jest.spyOn(AsyncStorage, …)`, which maps to `tests/mocks/async-storage.ts`.
- Add or update tests with every behaviour change.
- RNTL docs for the installed version are in `node_modules/@testing-library/react-native/docs/`.
