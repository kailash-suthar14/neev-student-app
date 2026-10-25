import type { SurveyAnswer, SurveyQuestion } from './models';

export const NOT_ANSWERED = 'Not answered';

/** Human-readable answer text for summaries. */
export function formatAnswer(question: SurveyQuestion, answer: SurveyAnswer | undefined): string {
  if (!answer || answer.type !== question.type) return NOT_ANSWERED;
  switch (answer.type) {
    case 'single_select':
    case 'multi_select': {
      const ids = Array.isArray(answer.value) ? answer.value : [answer.value];
      const options = 'options' in question ? question.options : [];
      return ids.map((id) => options.find((o) => o.id === id)?.label ?? id).join(', ');
    }
    case 'number':
      return question.type === 'number' && question.unit ? `${answer.value} ${question.unit}` : String(answer.value);
    case 'rating':
      return `${answer.value} / 5`;
    case 'short_text':
    case 'long_text':
      return answer.value;
  }
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
