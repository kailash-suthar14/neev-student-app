import { View } from 'react-native';

import { useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

export type SurveyStatus = 'not_started' | 'in_progress' | 'submitted';

const LABELS: Record<SurveyStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
};

export function StatusBadge({ status }: { status: SurveyStatus }) {
  const { colors, radii, spacing } = useTheme();
  const tone = {
    not_started: { bg: colors.surfaceMuted, fg: colors.textMuted },
    in_progress: { bg: colors.warningSoft, fg: colors.warning },
    submitted: { bg: colors.successSoft, fg: colors.success },
  }[status];
  return (
    <View
      accessibilityLabel={`Status: ${LABELS[status]}`}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tone.bg,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}>
      <AppText variant="caption" style={{ color: tone.fg, fontWeight: '600' }}>
        {LABELS[status]}
      </AppText>
    </View>
  );
}
