import { z } from 'zod';

import {
  surveyAnswerSchema,
  surveySchema,
  surveySubmissionSchema,
  surveySummarySchema,
} from '@/features/surveys/models';

/** Success envelope used by every proposed endpoint: `{ "data": ..., "meta": {...} }`. */
export interface ApiResponse<T> {
  data: T;
  meta?: { requestId?: string };
}

export function apiResponseSchema<T>(data: z.ZodType<T>): z.ZodType<ApiResponse<T>> {
  return z.object({
    data,
    meta: z.object({ requestId: z.string().optional() }).optional(),
  });
}

/** Error envelope: `{ "error": { "code", "message", "details"? } }`. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Field-level messages keyed by field or question ID. */
  details: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export const apiErrorBodySchema = z.object({ error: apiErrorSchema });

// ---- DTOs (see docs/backend-api-contract.md) ----

/**
 * `POST /api/firebase-auth-token` success body. The session token itself
 * arrives in the `X-Auth-Token` response header. Values are strings ("true").
 */
export const firebaseAuthTokenResponseDtoSchema = z.object({
  status: z.string().optional(),
  deviceConflict: z.string().optional(),
});

/** `GET /api/accountInfo` (AccountInfo DTO in glsservices). Only the fields the app reads. */
export const accountInfoDtoSchema = z.object({
  username: z.string().nullish(),
  name: z.string().nullish(),
  email: z.string().nullish(),
  roles: z.array(z.string()).nullish(),
  authorities: z.array(z.string()).nullish(),
  isActive: z.boolean().nullish(),
});
export type AccountInfoDto = z.infer<typeof accountInfoDtoSchema>;

export const surveyListResponseDtoSchema = apiResponseSchema(z.array(surveySummarySchema));
export const surveyResponseDtoSchema = apiResponseSchema(surveySchema);

export const createSubmissionRequestDtoSchema = z.object({
  id: z.string().min(1),
  surveyVersion: z.number().int().positive(),
  respondentId: z.string().min(1).nullable(),
  answers: z.array(surveyAnswerSchema),
  createdAt: z.iso.datetime(),
});
export type CreateSubmissionRequestDto = z.infer<typeof createSubmissionRequestDtoSchema>;

export const submissionResponseDtoSchema = apiResponseSchema(surveySubmissionSchema);
export const submissionListResponseDtoSchema = apiResponseSchema(z.array(surveySubmissionSchema));

/** For endpoints that return 204 No Content. */
export const noContentSchema = z.undefined();
