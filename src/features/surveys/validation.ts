import {
  sortQuestions,
  type AnswerInput,
  type FormValues,
  type QuestionOfType,
  type Survey,
  type SurveyAnswer,
  type SurveyQuestion,
} from './models';

export type QuestionErrors = Readonly<Record<string, string>>;

export type AnswerValidationResult =
  | { valid: true; answers: SurveyAnswer[] }
  | { valid: false; errors: QuestionErrors; firstInvalidQuestionId: string };

/** Outcome for a single question: an error, a validated answer, or nothing (optional and blank). */
type QuestionOutcome = { error: string } | { answer: SurveyAnswer } | { skipped: true };

const REQUIRED_MESSAGE = 'This question is required.';
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

function asString(value: AnswerInput | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function asStringArray(value: AnswerInput | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function validateSingleSelect(
  q: QuestionOfType<'single_select'>,
  raw: AnswerInput | undefined,
): QuestionOutcome {
  const value = asString(raw);
  if (value === '') return q.required ? { error: 'Please choose an option.' } : { skipped: true };
  if (!q.options.some((o) => o.id === value)) return { error: 'Choose one of the listed options.' };
  return { answer: { questionId: q.id, type: 'single_select', value } };
}

function validateMultiSelect(
  q: QuestionOfType<'multi_select'>,
  raw: AnswerInput | undefined,
): QuestionOutcome {
  const selected = [...new Set(asStringArray(raw))];
  if (selected.length === 0) {
    return q.required ? { error: 'Select at least one option.' } : { skipped: true };
  }
  const known = new Set(q.options.map((o) => o.id));
  if (selected.some((id) => !known.has(id))) return { error: 'Choose only the listed options.' };
  if (q.minSelections !== undefined && selected.length < q.minSelections) {
    return { error: `Select at least ${q.minSelections} options.` };
  }
  if (q.maxSelections !== undefined && selected.length > q.maxSelections) {
    return { error: `Select no more than ${q.maxSelections} options.` };
  }
  // Keep the survey's option order so answers are stable regardless of tap order.
  const ordered = q.options.map((o) => o.id).filter((id) => selected.includes(id));
  return { answer: { questionId: q.id, type: 'multi_select', value: ordered } };
}

function validateText(
  q: QuestionOfType<'short_text'> | QuestionOfType<'long_text'>,
  raw: AnswerInput | undefined,
): QuestionOutcome {
  const value = asString(raw).trim();
  if (value === '') return q.required ? { error: REQUIRED_MESSAGE } : { skipped: true };
  if (q.minLength !== undefined && value.length < q.minLength) {
    return { error: `Enter at least ${q.minLength} characters.` };
  }
  if (q.maxLength !== undefined && value.length > q.maxLength) {
    return { error: `Keep this under ${q.maxLength} characters.` };
  }
  return { answer: { questionId: q.id, type: q.type, value } };
}

function validateNumber(q: QuestionOfType<'number'>, raw: AnswerInput | undefined): QuestionOutcome {
  // Accept a comma decimal separator (some locales' decimal keypads produce it).
  // Not for whole numbers, where "1,000" is a thousands separator, not 1.000.
  const trimmed = asString(raw).trim();
  const text = q.integer ? trimmed : trimmed.replace(',', '.');
  if (text === '') return q.required ? { error: REQUIRED_MESSAGE } : { skipped: true };
  if (!NUMBER_PATTERN.test(text)) return { error: 'Enter a valid number.' };
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: 'Enter a valid number.' };
  if (q.integer && !Number.isInteger(value)) return { error: 'Enter a whole number.' };
  if (q.min !== undefined && value < q.min) return { error: `Enter a number of at least ${q.min}.` };
  if (q.max !== undefined && value > q.max) return { error: `Enter a number no greater than ${q.max}.` };
  return { answer: { questionId: q.id, type: 'number', value } };
}

function validateRating(q: QuestionOfType<'rating'>, raw: AnswerInput | undefined): QuestionOutcome {
  if (raw === undefined || raw === '') {
    return q.required ? { error: 'Please choose a rating.' } : { skipped: true };
  }
  const value = typeof raw === 'number' ? raw : Number.NaN;
  if (!Number.isInteger(value) || value < 1 || value > q.scale) {
    return { error: `Choose a rating from 1 to ${q.scale}.` };
  }
  return { answer: { questionId: q.id, type: 'rating', value } };
}

export function validateQuestion(question: SurveyQuestion, raw: AnswerInput | undefined): QuestionOutcome {
  switch (question.type) {
    case 'single_select':
      return validateSingleSelect(question, raw);
    case 'multi_select':
      return validateMultiSelect(question, raw);
    case 'short_text':
    case 'long_text':
      return validateText(question, raw);
    case 'number':
      return validateNumber(question, raw);
    case 'rating':
      return validateRating(question, raw);
  }
}

/** Returns the error message for one question, or undefined when its current value is acceptable. */
export function getQuestionError(question: SurveyQuestion, raw: AnswerInput | undefined): string | undefined {
  const outcome = validateQuestion(question, raw);
  return 'error' in outcome ? outcome.error : undefined;
}

export function validateAnswers(survey: Survey, values: FormValues): AnswerValidationResult {
  const errors: Record<string, string> = {};
  const answers: SurveyAnswer[] = [];
  let firstInvalidQuestionId: string | undefined;

  for (const question of sortQuestions(survey)) {
    const outcome = validateQuestion(question, values[question.id]);
    if ('error' in outcome) {
      errors[question.id] = outcome.error;
      firstInvalidQuestionId ??= question.id;
    } else if ('answer' in outcome) {
      answers.push(outcome.answer);
    }
  }

  if (firstInvalidQuestionId !== undefined) {
    return { valid: false, errors, firstInvalidQuestionId };
  }
  return { valid: true, answers };
}

/** True when the user has provided any non-blank value, regardless of validity. */
export function hasValue(raw: AnswerInput | undefined): boolean {
  if (raw === undefined) return false;
  if (typeof raw === 'number') return true;
  if (Array.isArray(raw)) return raw.length > 0;
  return raw.trim() !== '';
}

export interface SurveyProgress {
  answered: number;
  total: number;
  requiredRemaining: number;
}

export function getProgress(survey: Survey, values: FormValues): SurveyProgress {
  let answered = 0;
  let requiredRemaining = 0;
  for (const q of survey.questions) {
    const filled = hasValue(values[q.id]);
    if (filled) answered += 1;
    else if (q.required) requiredRemaining += 1;
  }
  return { answered, total: survey.questions.length, requiredRemaining };
}
