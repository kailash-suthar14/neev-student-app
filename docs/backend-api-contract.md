# Backend API contract (PROPOSED)

> **Status: proposed placeholder.** This is not an agreed contract. The endpoints, payloads and error codes below describe what the app's REST repositories (`src/data/remote/`) currently expect. They must be reviewed and agreed with the backend team before use. If the agreed contract differs, update the DTO schemas in `src/data/remote/api-types.ts` and the matching repository. Screens and services need no changes.

## Conventions

- Base URL: `EXPO_PUBLIC_API_BASE_URL`, for example `https://api.example.com/v1`.
- Requests send `Accept: application/json`. Requests with a body also send `Content-Type: application/json`.
- Authenticated requests send `Authorization: Bearer <accessToken>`.
- Timestamps are ISO 8601 UTC, for example `2026-01-15T10:00:00.000Z`. IDs are opaque strings of 1–128 characters.
- Successful responses use the envelope `{ "data": <payload>, "meta": { "requestId": "..." } }`. `meta` is optional.
- Error responses use the envelope:

  ```json
  { "error": { "code": "validation_failed", "message": "Human-readable, for logs", "details": { "q_study_hours": "Must be between 0 and 80" } } }
  ```

  `details` is optional and maps field or question IDs to messages. The app shows `details` inline, but never shows `message` to users.

### Status-code mapping in the app

| HTTP          | `AppError.code` | App behaviour                                           |
| ------------- | --------------- | ------------------------------------------------------- |
| 2xx           | –               | Response validated against a schema; a mismatch gives `invalid_response` |
| 400, 422      | `validation`    | Inline errors from `details`                            |
| 401           | `unauthorized`  | Token cleared, user returned to login (`invalid_credentials` on `/auth/login`) |
| 403           | `forbidden`     | Error message                                           |
| 404           | `not_found`     | `GET /submissions/:id` returns `null`; otherwise an error |
| 409           | `conflict`      | Error message                                           |
| 5xx           | `server`        | Error message; answers kept for retry                   |
| other         | `http`          | Error message                                           |
| no response   | `network` / `timeout` | Error message; answers kept for retry             |

## Shared types

```ts
User          { id, email, displayName }
SurveySummary { id, version, title, description, questionCount, estimatedMinutes? }
Survey        { id, version, title, description, estimatedMinutes?, questions: SurveyQuestion[] }
SurveyQuestion (discriminated by "type"):
  base:          { id, type, prompt, description?, required, order }
  single_select: options: { id, label }[]            (at least 2)
  multi_select:  options, minSelections?, maxSelections?
  short_text / long_text: minLength?, maxLength?, placeholder?
  number:        min?, max?, integer?, unit?, placeholder?
  rating:        scale: 5, minLabel?, maxLabel?
SurveyAnswer (discriminated by "type"):
  { questionId, type: "single_select", value: string }      // option id
  { questionId, type: "multi_select",  value: string[] }    // option ids, at least 1
  { questionId, type: "short_text" | "long_text", value: string }
  { questionId, type: "number", value: number }
  { questionId, type: "rating", value: 1..5 }
SurveySubmission { id, surveyId, surveyVersion, respondentId | null, answers, status: "submitted", createdAt, updatedAt }
```

Optional questions that were left blank are omitted from `answers`.

---

## POST /auth/login

Unauthenticated.

Request:

```json
{ "email": "student@example.com", "password": "••••••••" }
```

`200` response:

```json
{
  "data": {
    "user": { "id": "user_123", "email": "student@example.com", "displayName": "Asha K" },
    "accessToken": "opaque-or-jwt",
    "expiresAt": "2026-01-22T10:00:00.000Z"
  }
}
```

`401` means invalid credentials. The app holds the token in memory only.

## POST /auth/logout

Authenticated. No body. Response: `204 No Content`. This should revoke the token. The app clears local credentials even if this call fails.

## GET /surveys

Authenticated. Returns the surveys available to the user. The app shows the first one.

```json
{ "data": [ { "id": "survey_learning_experience", "version": 1, "title": "Learning Experience Survey", "description": "…", "questionCount": 7, "estimatedMinutes": 3 } ] }
```

## GET /surveys/:surveyId

Authenticated. `404` if unknown.

```json
{
  "data": {
    "id": "survey_learning_experience",
    "version": 1,
    "title": "Learning Experience Survey",
    "description": "Help us improve your classes…",
    "estimatedMinutes": 3,
    "questions": [
      { "id": "q_course_level", "type": "single_select", "order": 1, "required": true,
        "prompt": "Which programme are you currently enrolled in?",
        "options": [ { "id": "foundation", "label": "Foundation" }, { "id": "advanced", "label": "Advanced" } ] },
      { "id": "q_overall_rating", "type": "rating", "order": 4, "required": true, "scale": 5,
        "prompt": "How would you rate your overall learning experience?", "minLabel": "Poor", "maxLabel": "Excellent" }
    ]
  }
}
```

## GET /surveys/:surveyId/submissions

Authenticated. Returns **the current user's** submissions for the survey. The server must scope results to the token's user.

```json
{ "data": [ { "id": "sub_9f…", "surveyId": "survey_learning_experience", "surveyVersion": 1, "respondentId": "user_123", "answers": [ … ], "status": "submitted", "createdAt": "…", "updatedAt": "…" } ] }
```

## POST /surveys/:surveyId/submissions

Authenticated. Headers include `Idempotency-Key: <submission id>`.

Request:

```json
{
  "id": "sub_6c1f0c7e-…",
  "surveyVersion": 1,
  "respondentId": "user_123",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "answers": [
    { "questionId": "q_course_level", "type": "single_select", "value": "intermediate" },
    { "questionId": "q_helpful_resources", "type": "multi_select", "value": ["live_classes", "practice_tests"] },
    { "questionId": "q_study_hours", "type": "number", "value": 12 },
    { "questionId": "q_overall_rating", "type": "rating", "value": 4 },
    { "questionId": "q_recommend", "type": "single_select", "value": "yes" }
  ]
}
```

Responses:

- `201 Created` returns `{ "data": SurveySubmission }`. The `id` and `surveyId` must match the request, or the app rejects the response.
- **Idempotency:** a replay with the same `Idempotency-Key` and an identical body should return `200` with the originally stored submission. The same key with a different body should return `409`.
- `422` when the answers fail server-side validation (`details` keyed by question ID). `409` when `surveyVersion` is outdated.

The server should re-validate every answer against the survey definition and must not trust `respondentId` from the body. It should derive it from the token; the field is informational.

## GET /submissions/:submissionId

Authenticated. Returns `{ "data": SurveySubmission }`. Returns `404` if the submission does not exist **or belongs to another user**.

---

## Open questions for the backend team

1. Token format and lifetime; whether refresh tokens are needed.
2. Whether a user may submit the same survey more than once.
3. How survey versioning works when a survey changes mid-response (the app discards drafts on a version change).
4. Pagination for `GET /surveys` and the submissions lists.
5. Rate limiting and the `Retry-After` header for 429 responses.
