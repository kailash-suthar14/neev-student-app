# Testing

## Commands

```bash
npm test              # all Jest suites
npm test -- tests/unit/survey-validation.test.ts   # one file
npm run test:watch
npm run typecheck
npm run lint
npm run check         # typecheck + lint + tests
```

## Setup

- Jest uses the `jest-expo` preset, configured in `package.json` under `"jest"`. Tests live in `tests/`.
- UI tests use React Native Testing Library 14. Its `render`, `fireEvent` and `act` are **async**, so always `await` them.
- `expo-router/testing-library`'s `renderRouter('src/app')` renders the real route files, including the root layout and composition root.
- AsyncStorage is replaced by `tests/mocks/async-storage.ts`, a plain in-memory module, through `moduleNameMapper`. Its methods are not `jest.fn`s, so tests can `jest.spyOn` them to inject failures and restore them cleanly. `restoreMocks` is on.
- `tests/setup-env.ts` sets `EXPO_PUBLIC_MOCK_LATENCY_MS=0`.
- REST tests inject a recording fake `fetch` (`tests/helpers/http.ts`). No test touches the network.

## What is covered

| Area | File |
| --- | --- |
| Answer validation for all six question types, required/optional, progress | `tests/unit/survey-validation.test.ts` |
| Valid and invalid login, field errors, session restore, expiry, malformed session, logout, no password stored | `tests/unit/auth.test.ts` |
| AsyncStorage adapter, versioned envelope, CRUD, restart survival, malformed JSON, unsupported version, invalid records, storage read/write failures, concurrent writes, idempotent re-save, drafts | `tests/unit/local-persistence.test.ts` |
| Survey loading, empty state, validation errors, persistence before success, duplicate-submit collapse, **retry of the same attempt is identical even as the clock moves**, storage failure keeps the draft, per-user drafts and submissions | `tests/unit/survey-service.test.ts` |
| ApiClient headers, auth, 204, status mapping, error details, 401 callback, network error, timeout, cancellation, malformed and invalid responses | `tests/unit/api-client.test.ts` |
| REST auth, surveys and submissions; idempotency header; no local fallback on server or network errors; 404 → null | `tests/unit/rest-repositories.test.ts` |
| Env parsing and validation, release-build rules (no mock mode, https only); **mock mode makes zero network calls**; REST wiring | `tests/unit/container.test.ts` |
| AuthProvider: restore, sign in and out, restore failure and retry, session expiry; `useSession` stays stable while a protected screen unmounts | `tests/unit/auth-context.test.tsx` |
| Login form shows a form-level error for server field details it can't place; the submission-detail screen reports 401 so the user is signed out | `tests/unit/feature-hooks.test.tsx` |
| End-to-end UI: splash routing, login errors and success, session restore, logout, restore failure and retry, validation messages, answer preservation, successful submit and summary, detail screen, restart shows "Submitted", **disabled submit and a single stored submission**, storage-failure retry, draft restore, draft flushed on unmount | `tests/integration/app-flow.test.tsx` |

## Manual test checklist

Run on an iOS simulator and an Android emulator (`npx expo start`, then `i` or `a`).

1. **Cold start, signed out**: the native splash hands over to the branded splash, then the login screen appears with no blank frame and no flash of the survey.
2. **Login validation**: tap Sign in with empty fields to see inline errors. Wrong password shows an error banner and clears the password field.
3. **Login success** with `demo@example.com` / `Demo123!` opens the survey. The email keyboard appears for the email field, and Return moves focus to the password field.
4. **Restart** the app (kill it, then reopen). It goes straight to the survey.
5. **Validation**: tap Submit with nothing answered. The error summary appears, the view scrolls to question 1, and each required question shows an inline error.
6. Answer some questions, kill the app and reopen. The draft answers are restored, and the status reads "In progress".
7. **Number field** uses the numeric keypad. `200` shows a range error.
8. **Submit**: the button shows "Submitting…" and is disabled. Then a success banner and answer summary appear. "View saved submission" opens the detail screen.
9. Restart. The landing screen shows "Already submitted" with the date.
10. **Logout** from the header returns to login. Reopening the app stays on login.
11. **Accessibility**: with VoiceOver or TalkBack, options are announced as radio buttons or checkboxes with their checked state, and errors are announced. With the largest system font, text stays readable (it is capped at 1.6×).
12. **Dark mode**: toggle the system theme. Colours switch and contrast stays readable.
13. **Small and large screens**: check an iPhone SE-sized device and a tablet. Content is limited to 640 px wide and centred.
14. **Airplane mode** in mock mode: everything works.
15. **REST mode** (optional): set `EXPO_PUBLIC_DATA_MODE=rest` with an unreachable base URL and restart with `--clear`. Sign-in shows "You appear to be offline…" and stays on the login screen. No session is stored.
