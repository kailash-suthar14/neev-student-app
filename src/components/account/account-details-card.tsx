import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import type { AccountInfoState } from '@/features/account/use-account-info';
import { useTheme } from '@/theme/use-theme';

function DetailRow({ label, value }: { label: string; value: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText tone="muted">{label}</AppText>
      <AppText style={{ flexShrink: 1, textAlign: 'right' }}>{value}</AppText>
    </View>
  );
}

const orDash = (value: string | null) => (value && value.trim() ? value : '—');

/** The signed-in user's backend account (`GET /api/accountInfo`). */
export function AccountDetailsCard({ state, onRetry }: { state: AccountInfoState; onRetry: () => void }) {
  const { colors, spacing } = useTheme();

  return (
    <Card testID="account-details">
      <AppText variant="heading">Account details</AppText>
      {state.status === 'loading' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator color={colors.primary} />
          <AppText tone="muted">Loading account…</AppText>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <>
          <AppText tone="danger" accessibilityRole="alert">
            {state.message}
          </AppText>
          <Button variant="secondary" label="Try again" onPress={onRetry} />
        </>
      ) : null}
      {state.status === 'ready' ? (
        <View style={{ gap: spacing.sm }}>
          <DetailRow label="Name" value={orDash(state.account.name)} />
          <DetailRow label="Email" value={orDash(state.account.email)} />
          <DetailRow label="Username" value={orDash(state.account.username)} />
          <DetailRow label="Role" value={orDash(state.account.roles.join(', '))} />
          <DetailRow
            label="Status"
            value={state.account.isActive === null ? '—' : state.account.isActive ? 'Active' : 'Inactive'}
          />
          <DetailRow label="Permissions" value={String(state.account.authorities.length)} />
        </View>
      ) : null}
    </Card>
  );
}
