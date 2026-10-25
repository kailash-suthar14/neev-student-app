import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button } from '@/components/button';
import { useAppServices } from '@/config/app-services';
import { getUserMessage } from '@/core/errors';
import { useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/theme/use-theme';

function LogoutButton() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Sign-out problem', getUserMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="ghost"
      fullWidth={false}
      label="Log out"
      loadingLabel="Logging out…"
      loading={busy}
      onPress={() => void logout()}
    />
  );
}

export default function AppLayout() {
  const { config } = useAppServices();
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen
        name="index"
        options={{ title: config.appName, headerRight: () => <LogoutButton /> }}
      />
      <Stack.Screen name="submissions/[submissionId]" options={{ title: 'Your submission' }} />
    </Stack>
  );
}
