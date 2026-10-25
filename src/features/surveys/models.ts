import { z } from 'zod';

const idSchema = z.string().min(1).max(128);
const isoDateTime = z.iso.datetime();

export const surveyOptionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
});
export type SurveyOption = z.infer<typeof surveyOptionSchema>;

const questionBase = {
  id: idSchema,
  prompt: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean(),
  order: z.number().int().nonnegative(),
};

const textConstraints = {
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  placeholder: z.string().optional(),
};

export const surveyQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    ...questionBase,
    type: z.literal('single_select'),
    options: z.array(surveyOptionSchema).min(2),
  }),
  z.object({
    ...questionBase,
    type: z.literal('multi_select'),
    options: z.array(surveyOptionSchema).min(2),
    minSelections: z.number().int().positive().optional(),
    maxSelections: z.number().int().positive().optional(),
  }),
  z.object({ ...questionBase, type: z.literal('short_text'), ...textConstraints }),
  z.object({ ...questionBase, type: z.literal('long_text'), ...textConstraints }),
  z.object({
    ...questionBase,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().optional(),
    unit: z.string().optional(),
    placeholder: z.string().optional(),
  }),
  z.object({
    ...questionBase,
    type: z.literal('rating'),
    scale: z.literal(5),
    minLabel: z.string().optional(),
    maxLabel: z.string().optional(),
  }),
]);
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type SurveyQuestionType = SurveyQuestion['type'];
export type QuestionOfType<T extends SurveyQuestionType> = Extract<SurveyQuestion, { type: T }>;

export const surveySchema = z
  .object({
    id: idSchema,
    version: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string(),
    estimatedMinutes: z.number().int().positive().optional(),
    questions: z.array(surveyQuestionSchema).min(1),
  })
  .superRefine((survey, ctx) => {
    if (new Set(survey.questions.map((q) => q.id)).size !== survey.questions.length) {
      ctx.addIssue({ code: 'custom', message: 'Question IDs must be unique within a survey.', path: ['questions'] });
    }
    survey.questions.forEach((q, index) => {
      const problem = findConstraintProblem(q);
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['questions', index] });
    });
  });

/** Rejects question definitions that no answer could ever satisfy. */
function findConstraintProblem(q: SurveyQuestion): string | undefined {
  switch (q.type) {
    case 'single_select':
    case 'multi_select': {
      if (new Set(q.options.map((o) => o.id)).size !== q.options.length) return 'Duplicate option IDs.';
      if (q.type === 'multi_select') {
        const { minSelections = 1, maxSelections = q.options.length } = q;
        if (minSelections > maxSelections || minSelections > q.options.length) {
          return 'Selection limits cannot be satisfied.';
        }
      }
      return undefined;
    }
    case 'short_text':
    case 'long_text':
      return q.minLength !== undefined && q.maxLength !== undefined && q.minLength > q.maxLength
        ? 'minLength exceeds maxLength.'
        : undefined;
    case 'number':
      return q.min !== undefined && q.max !== undefined && q.min > q.max ? 'min exceeds max.' : undefined;
    case 'rating':
      return undefined;
  }
}
export type Survey = z.infer<typeof surveySchema>;

export const surveySummarySchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string(),
  questionCount: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type SurveySummary = z.infer<typeof surveySummarySchema>;

/** A validated answer. Each variant carries the value type appropriate to its question type. */
export const surveyAnswerSchema = z.discriminatedUnion('type', [
  z.object({ questionId: idSchema, type: z.literal('single_select'), value: idSchema }),
  z.object({ questionId: idSchema, type: z.literal('multi_select'), value: z.array(idSchema).min(1) }),
  z.object({ questionId: idSchema, type: z.literal('short_text'), value: z.string() }),
  z.object({ questionId: idSchema, type: z.literal('long_text'), value: z.string() }),
  z.object({ questionId: idSchema, type: z.literal('number'), value: z.number().finite() }),
  z.object({ questionId: idSchema, type: z.literal('rating'), value: z.number().int().min(1).max(5) }),
]);
export type SurveyAnswer = z.infer<typeof surveyAnswerSchema>;

/**
 * `submitted` means the submission was durably accepted by the active
 * SubmissionRepository (local storage in mock mode, the server in REST mode).
 * Future offline queuing would add a `pending_sync` state.
 */
export const submissionStatusSchema = z.enum(['submitted']);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const surveySubmissionSchema = z.object({
  id: idSchema,
  surveyId: idSchema,
  surveyVersion: z.number().int().positive(),
  respondentId: idSchema.nullable(),
  answers: z.array(surveyAnswerSchema),
  status: submissionStatusSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;

/**
 * Raw, possibly-incomplete form values keyed by question ID. Numbers are
 * kept as the text the user typed until validation converts them.
 */
export const answerInputSchema = z.union([z.string(), z.array(z.string()), z.number()]);
export type AnswerInput = z.infer<typeof answerInputSchema>;
export type FormValues = Readonly<Record<string, AnswerInput | undefined>>;

/** A locally saved, unsubmitted draft. Drafts never leave the device. */
export const surveyDraftSchema = z.object({
  surveyId: idSchema,
  surveyVersion: z.number().int().positive(),
  /** Drafts are only restored for the user who created them. */
  respondentId: idSchema.nullable(),
  values: z.record(z.string(), answerInputSchema),
  updatedAt: isoDateTime,
});
export type SurveyDraft = z.infer<typeof surveyDraftSchema>;

export function sortQuestions(survey: Survey): SurveyQuestion[] {
  return [...survey.questions].sort((a, b) => a.order - b.order);
}

export function toSurveySummary(survey: Survey): SurveySummary {
  return {
    id: survey.id,
    version: survey.version,
    title: survey.title,
    description: survey.description,
    questionCount: survey.questions.length,
    estimatedMinutes: survey.estimatedMinutes,
  };
}
