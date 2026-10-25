import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { BrandedSplash } from '@/components/branded-splash';
import { AppServicesProvider } from '@/config/app-services';
import { createAppServices, type AppServices } from '@/config/container';
import { parseAppConfig, readProcessEnv } from '@/config/env';
import { getUserMessage, toAppError } from '@/core/errors';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { useTheme } from '@/theme/use-theme';

// Keep the native splash up until the first meaningful frame is ready.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const FALLBACK_APP_NAME = 'Survey';

/** Built once at startup: the composition root selects mock or REST implementations. */
function bootstrap(): { services: AppServices } | { error: string } {
  try {
    return { services: createAppServices(parseAppConfig(readProcessEnv())) };
  } catch (error) {
    if (__DEV__) console.error(toAppError(error).message);
    return { error: getUserMessage(error) };
  }
}
const boot = bootstrap();

const hideSplash = () => SplashScreen.hide();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      {'error' in boot ? (
        <BrandedSplash
          appName={FALLBACK_APP_NAME}
          error={{ title: 'Unable to start', message: boot.error }}
          onReady={hideSplash}
        />
      ) : (
        <AppServicesProvider services={boot.services}>
          <AuthProvider>
            <RootNavigator appName={boot.services.config.appName} />
          </AuthProvider>
        </AppServicesProvider>
      )}
    </>
  );
}

function RootNavigator({ appName }: { appName: string }) {
  const { state, retryRestore, continueSignedOut } = useAuth();
  const { colors } = useTheme();
  const ready = state.status === 'signed_in' || state.status === 'signed_out';

  // Safety net: hide the native splash once routing is decided, even if the
  // branded splash never laid out (e.g. session restored synchronously).
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  if (state.status === 'restoring') {
    return <BrandedSplash appName={appName} onReady={hideSplash} />;
  }
  if (state.status === 'restore_failed') {
    return (
      <BrandedSplash
        appName={appName}
        error={{ title: 'We could not restore your session', message: getUserMessage(state.error) }}
        onRetry={retryRestore}
        onContinue={continueSignedOut}
        onReady={hideSplash}
      />
    );
  }

  const signedIn = state.status === 'signed_in';
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
