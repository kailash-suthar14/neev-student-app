import { AccountDetailsCard } from '@/components/account/account-details-card';
import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { useAccountInfo } from '@/features/account/use-account-info';
import { useAuth, useSession } from '@/features/auth/auth-context';

export default function HomeScreen() {
  const session = useSession();
  const { expireSession } = useAuth();
  const accountInfo = useAccountInfo(expireSession);

  return (
    <Screen>
      <AppText variant="title">Welcome, {session.user.displayName}</AppText>
      <AccountDetailsCard state={accountInfo.state} onRetry={accountInfo.reload} />
    </Screen>
  );
}
