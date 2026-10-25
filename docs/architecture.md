# Architecture

## Layers and dependency rule

```
src/app (routes/screens) ─┐
src/components (UI)      ─┼─▶ src/features (services, hooks, models, validation)
                          │        │
                          │        ▼
                          │   src/data/repositories (interfaces only)
                          │        ▲
src/config/container.ts ──┴──▶ src/data/{mock,local,remote} (implementations)
```

- **Screens** (`src/app`) are thin. They read state from feature hooks such as `useSurveyForm`, `useLoginForm` and `useAuth`, and render components. They never import AsyncStorage, call `fetch`, or import anything from `src/data`.
- **Feature services** (`AuthService`, `SurveyService`) hold the business rules: validation, building submissions, de-duplicating in-flight submissions, and draft handling. They depend only on the **repository interfaces** in `src/data/repositories`.
- **Repositories** have interchangeable mock and REST implementations:

  | Interface              | Mock                                         | REST                       |
  | ---------------------- | -------------------------------------------- | -------------------------- |
  | `AuthRepository`       | `MockAuthRepository` (+ `SessionStore`)      | `RestAuthRepository`       |
  | `SurveyRepository`     | `MockSurveyRepository` (seed data)           | `RestSurveyRepository`     |
  | `SubmissionRepository` | `MockSubmissionRepository` (+ `LocalSubmissionStore`) | `RestSubmissionRepository` |
  | `DraftRepository`      | `LocalDraftRepository`, always local in both modes | –                    |

- **Composition root**: `src/config/container.ts` (`createAppServices`) is the only module that constructs concrete implementations. `src/app/_layout.tsx` calls it once and provides the result through React context (`AppServicesProvider`). Tests call it with an in-memory storage, a mocked `fetch`, a fixed clock and deterministic IDs.

ESLint enforces these boundaries (see `eslint.config.js`):

- `src/app` and `src/components` may not import `@/data/*` or AsyncStorage, and may not use `fetch`.
- `src/features` may not import concrete `@/data/{mock,local,remote}` modules or use `fetch`.

## Startup and navigation

1. `src/app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` at module scope, then builds the services from validated environment variables. An invalid configuration shows a branded error screen instead of crashing.
2. `AuthProvider` restores the session (`AuthService.restoreSession`). While it runs, the root layout renders `BrandedSplash`, which shows the app name and a logo placeholder. Its `onLayout` hides the native splash, so there is no blank frame. The navigator is not mounted yet, so there is no route flash.
3. When restore finishes, the root `Stack` mounts with `Stack.Protected` guards:
   - signed in → the `(app)` group (survey landing `/`, submission detail `/submissions/[submissionId]`)
   - signed out → `/login`
4. If restore fails (for example, a storage read error), the splash shows **Try again** and **Continue to sign in**.
5. Signing in or out only changes auth state. The guards perform the navigation.

## Survey data flow

```
QuestionField ──onChange──▶ useSurveyForm.setAnswer ──debounced──▶ SurveyService.saveDraft ──▶ DraftRepository
Submit button ──▶ useSurveyForm.submit
                    ├─ validateAnswers (local, inline errors, scroll to first error)
                    ├─ in-flight ref + disabled button (UI guard)
                    └─▶ SurveyService.submit
                          ├─ re-validate
                          ├─ one in-flight promise per survey (service guard)
                          ├─ SubmissionRepository.create  ◀── success only after this resolves
                          └─ DraftRepository.remove (best effort)
```

- **Validation** (`src/features/surveys/validation.ts`) covers required answers and type-specific constraints: valid option IDs, min/max selections, text length, numeric format, range and integer, and a 1–5 rating. Errors map by question ID. Answers stay in the form when validation fails.
- **Duplicate prevention** works at three levels: the button is disabled while saving, the hook has a re-entrancy ref, and the service collapses concurrent submits for the same survey into one promise.
- **Idempotency**: `SurveyService.beginAttempt()` creates a `SubmissionAttempt` (an ID and a `createdAt` timestamp) from the injected ID generator and clock. The hook reuses the same attempt when retrying an unchanged form, so the retried request is byte-identical even if time has passed. Editing an answer starts a new attempt. The REST repository sends the ID as the `Idempotency-Key` header and in the body, and `LocalSubmissionStore` treats re-saving an identical record as a no-op.
- **Drafts vs submissions**: drafts are unsubmitted answers, stored under `<respondentId>:<surveyId>`, so users who share a device never see or overwrite each other's drafts. Drafts are autosaved 600 ms after the last edit and also when the screen unmounts, for example on sign-out. They are discarded when the survey version changes, never sent to the server, and cleared after a successful submit. A submission is a separate record with `status: "submitted"`.
- **Scoping**: the landing screen and detail screen show only the signed-in user's submissions and drafts.

## Local persistence

- `KeyValueStorage` wraps AsyncStorage (`createAsyncStorageAdapter`). Native failures become `AppError('storage')`.
- Keys are namespaced and versioned: `survey-app:v1:session`, `survey-app:v1:submissions`, `survey-app:v1:drafts`.
- Each value is stored as `{ "schemaVersion": 1, "data": … }`. `VersionedJsonStore` validates every read with Zod.
- **Malformed, unsupported-version or invalid data is quarantined.** It is copied to `<key>:quarantine:<timestamp>`, with a `-n` suffix if that key is taken, and removed from the main key. It is never silently overwritten. Quarantined copies are not cleaned up automatically yet. For submissions, individually invalid records are dropped from the working set, and the original payload is preserved in quarantine. A corrupt session is simply discarded, and the user signs in again.
- Writes resolve only after `setItem` succeeds. Read-modify-write cycles are serialised per store, so concurrent saves are not lost.
- **AsyncStorage is not encrypted.** Only non-sensitive data is stored: a session record with user ID, email, display name and timestamps, plus survey answers. No password or access token is ever written. The `authSessionSchema` has no field for one.

### Production migration considerations

- To change the stored shape, add a v2 key and a one-time migration that reads v1, transforms and validates the data, writes v2, and then removes v1. Do not mutate the v1 format in place.
- Bump `STORED_SCHEMA_VERSION` only for envelope changes that old builds must refuse to read. Old builds will quarantine the data rather than corrupt it.
- Provide a recovery or export path for quarantined keys if survey answers become important to recover.
- If survey answers may contain personal data, consider encrypted storage, for example SQLite with SQLCipher or secure-store-protected keys, plus a retention and wipe-on-logout policy.

## REST layer

- `ApiClient` (`src/data/remote/api-client.ts`) handles:
  - base URL joining, `Accept` and `Content-Type` headers, and an optional bearer token
  - timeout via `AbortController`, also covering the body read, plus caller cancellation
  - JSON parsing, HTTP status mapping to `AppError` codes, Zod validation of responses, and a 401 callback
- It never logs bodies, tokens or passwords. Error messages contain only the method, path and status. Messages shown to users come from `getUserMessage(code)`, never from raw server text.
- `RestSubmissionRepository.create` resolves only on a 2xx response carrying the same submission. Any failure propagates, with **no local fallback**. The form keeps its answers, and the user sees an error and can retry with the same idempotency key.
- **Tokens**: `InMemoryTokenStore` keeps the access token in memory only, so in REST mode the user signs in again after an app restart. For persistent sign-in, implement `TokenStore` with `expo-secure-store` (Keychain/Keystore) and restore the session from it in `RestAuthRepository.getCurrentSession`.
- **401 handling**: the client clears the token. The survey and submission-detail hooks call `expireSession()`, which returns the user to login with a notice.
- **409 conflict** is shown as "This conflicts with newer data. Please reload and try again." It never says the response was saved. Telling an outdated survey version apart from other conflicts by the server's error `code` is a backend-integration task.

## Configuration safety

`parseAppConfig` (`src/config/env.ts`) validates every variable. In release builds (`__DEV__ === false`) it also:

- requires `EXPO_PUBLIC_DATA_MODE` to be set explicitly, so a release can never fall back to mock login by accident;
- rejects a plain `http://` API base URL.

An invalid configuration shows a branded "Unable to start" screen.

## Future: offline queue, retry and sync

These are not implemented and are documented as the intended design:

1. Add `status: 'pending_sync'` and persist submissions locally first, using `LocalSubmissionStore`, before calling the server.
2. A sync worker on app foreground and on connectivity change POSTs pending items in order. It uses the stored submission ID as the `Idempotency-Key` and retries with exponential backoff and jitter for `network`, `timeout` and 5xx errors.
3. On a 2xx response, or a 409 for an identical replay, mark the item `submitted`. On 4xx validation errors, mark it `rejected` and show it to the user. Never retry it silently.
4. Show pending and rejected items on the landing screen. The server should treat `(surveyId, submission id)` as unique.

## Assumptions

- One featured survey is shown, the first returned by `listSurveys`. The repository already supports more.
- A user may submit the same survey more than once. The landing screen shows when they last submitted and offers "Submit another response".
- Mock sessions last 7 days. REST session expiry comes from the server's `expiresAt`.
- Rating questions are fixed at a 1–5 scale (`scale: 5`).
- Survey definitions are rejected if no answer could ever satisfy them, for example `min > max`, duplicate option IDs, or impossible selection limits.
- Number questions accept a comma decimal separator (`2,5`) unless they are whole-number questions, where `1,000` is rejected rather than read as 1.
- Draft autosave runs 600 ms after the last change. A draft-save failure shows a non-blocking warning.
