import { LEARNING_EXPERIENCE_SURVEY as survey } from '@/data/mock/seed-surveys';
import { surveySchema, type SurveyQuestion } from '@/features/surveys/models';
import {
  getProgress,
  getQuestionError,
  validateAnswers,
} from '@/features/surveys/validation';

import { VALID_SEED_VALUES } from '../helpers/fixtures';

function question(id: string): SurveyQuestion {
  const q = survey.questions.find((x) => x.id === id);
  if (!q) throw new Error(`missing ${id}`);
  return q;
}

describe('seed survey', () => {
  it('is schema-valid and covers every question type', () => {
    expect(surveySchema.safeParse(survey).success).toBe(true);
    const types = new Set(survey.questions.map((q) => q.type));
    expect(types).toEqual(
      new Set(['single_select', 'multi_select', 'short_text', 'long_text', 'number', 'rating']),
    );
    expect(survey.questions.length).toBeGreaterThanOrEqual(6);
  });
});

describe('surveySchema constraint checks', () => {
  const base = { id: 'q', order: 1, required: true, prompt: 'P' };
  it.each<[string, SurveyQuestion]>([
    ['min > max', { ...base, type: 'number', min: 10, max: 1 }],
    ['minLength > maxLength', { ...base, type: 'short_text', minLength: 10, maxLength: 5 }],
    ['duplicate options', { ...base, type: 'single_select', options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }],
    [
      'unsatisfiable selections',
      { ...base, type: 'multi_select', minSelections: 3, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    ],
  ])('rejects a question with %s', (_label, question) => {
    expect(surveySchema.safeParse({ ...survey, questions: [question] }).success).toBe(false);
  });
});

describe('validateAnswers', () => {
  it('reports every unanswered required question and the first one in order', () => {
    const result = validateAnswers(survey, {});
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      ['q_course_level', 'q_helpful_resources', 'q_overall_rating', 'q_recommend', 'q_study_hours'].sort(),
    );
    expect(result.firstInvalidQuestionId).toBe('q_course_level');
  });

  it('accepts a complete set of answers and omits blank optional questions', () => {
    const result = validateAnswers(survey, VALID_SEED_VALUES);
    expect(result).toEqual({
      valid: true,
      answers: [
        { questionId: 'q_course_level', type: 'single_select', value: 'intermediate' },
        // Survey option order, not tap order.
        { questionId: 'q_helpful_resources', type: 'multi_select', value: ['live_classes', 'practice_tests'] },
        { questionId: 'q_study_hours', type: 'number', value: 12 },
        { questionId: 'q_overall_rating', type: 'rating', value: 4 },
        { questionId: 'q_recommend', type: 'single_select', value: 'yes' },
      ],
    });
  });

  it('includes trimmed optional text answers when provided', () => {
    const result = validateAnswers(survey, {
      ...VALID_SEED_VALUES,
      q_favourite_topic: '  Algebra ',
      q_improvements: 'More practice tests please',
    });
    expect(result.valid && result.answers).toEqual(
      expect.arrayContaining([
        { questionId: 'q_favourite_topic', type: 'short_text', value: 'Algebra' },
        { questionId: 'q_improvements', type: 'long_text', value: 'More practice tests please' },
      ]),
    );
  });
});

describe('single-select', () => {
  const q = question('q_course_level');
  it('requires a choice', () => expect(getQuestionError(q, '')).toBe('Please choose an option.'));
  it('rejects unknown options', () =>
    expect(getQuestionError(q, 'phd')).toBe('Choose one of the listed options.'));
  it('accepts a listed option', () => expect(getQuestionError(q, 'advanced')).toBeUndefined());
});

describe('multi-select', () => {
  const q = question('q_helpful_resources');
  it('requires at least one selection', () =>
    expect(getQuestionError(q, [])).toBe('Select at least one option.'));
  it('enforces the maximum', () =>
    expect(getQuestionError(q, ['live_classes', 'study_notes', 'practice_tests', 'doubt_sessions'])).toBe(
      'Select no more than 3 options.',
    ));
  it('rejects unknown options', () =>
    expect(getQuestionError(q, ['live_classes', 'hacked'])).toBe('Choose only the listed options.'));
  it('ignores duplicate ids', () =>
    expect(getQuestionError(q, ['live_classes', 'live_classes'])).toBeUndefined());
});

describe('text', () => {
  it('treats whitespace as blank for optional questions', () => {
    expect(getQuestionError(question('q_favourite_topic'), '   ')).toBeUndefined();
  });
  it('enforces min and max length', () => {
    const q = question('q_improvements');
    expect(getQuestionError(q, 'short')).toBe('Enter at least 10 characters.');
    expect(getQuestionError(q, 'x'.repeat(501))).toBe('Keep this under 500 characters.');
  });
});

describe('number', () => {
  const q = question('q_study_hours');
  it.each([
    ['', 'This question is required.'],
    ['abc', 'Enter a valid number.'],
    ['1e3', 'Enter a valid number.'],
    ['2.5', 'Enter a whole number.'],
    ['-1', 'Enter a number of at least 0.'],
    ['81', 'Enter a number no greater than 80.'],
  ])('rejects %p', (input, message) => expect(getQuestionError(q, input)).toBe(message));
  it('accepts an in-range integer', () => expect(getQuestionError(q, ' 40 ')).toBeUndefined());
  it('rejects thousands separators for whole numbers', () =>
    expect(getQuestionError(q, '1,000')).toBe('Enter a valid number.'));
  it('accepts a comma decimal separator for decimal questions', () => {
    const decimal: SurveyQuestion = { id: 'q_d', type: 'number', order: 1, required: true, prompt: 'Weight' };
    expect(validateAnswers({ ...survey, questions: [decimal] }, { q_d: '2,5' })).toEqual({
      valid: true,
      answers: [{ questionId: 'q_d', type: 'number', value: 2.5 }],
    });
  });
});

describe('rating', () => {
  const q = question('q_overall_rating');
  it('requires a rating', () => expect(getQuestionError(q, undefined)).toBe('Please choose a rating.'));
  it.each([0, 6, 2.5])('rejects %p', (v) =>
    expect(getQuestionError(q, v)).toBe('Choose a rating from 1 to 5.'));
  it.each([1, 5])('accepts %p', (v) => expect(getQuestionError(q, v)).toBeUndefined());
});

describe('getProgress', () => {
  it('counts answered questions and remaining required ones', () => {
    expect(getProgress(survey, { q_course_level: 'advanced', q_favourite_topic: 'x' })).toEqual({
      answered: 2,
      total: 7,
      requiredRemaining: 4,
    });
  });
});
