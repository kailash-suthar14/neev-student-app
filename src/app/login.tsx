import { useRef } from 'react';
import { Platform, View, type TextInputInstance } from 'react-native';

import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { useAppServices } from '@/config/app-services';
import { useAuth } from '@/features/auth/auth-context';
import { useLoginForm } from '@/features/auth/use-login-form';
import { useTheme } from '@/theme/use-theme';

export default function LoginScreen() {
  const { config } = useAppServices();
  const { state } = useAuth();
  const form = useLoginForm();
  const { spacing } = useTheme();
  const passwordRef = useRef<TextInputInstance>(null);
  const isMock = config.dataMode === 'mock';
  // Android only: App Store guideline 4.8 would require Sign in with Apple
  // alongside a third-party login, and accounts are provisioned as email/password.
  const showGoogle = form.supportsGoogleSignIn && Platform.OS === 'android';
  const notice = state.status === 'signed_out' ? state.notice : undefined;

  return (
    <Screen centered edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <BrandMark appName={config.appName} />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {config.appName}
        </AppText>
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          Sign in to continue.
        </AppText>
      </View>

      {notice ? <Banner tone="warning" message={notice} /> : null}

      {isMock ? (
        <Banner
          tone="info"
          title="Development mode"
          message={`Mock sign-in only — no real account is used. Demo login: ${config.mock.demoEmail} / ${config.mock.demoPassword}`}
          testID="mock-auth-banner"
        />
      ) : null}

      <Card>
        <TextField
          label="Email"
          value={form.email}
          onChangeText={form.setEmail}
          error={form.fieldErrors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          editable={!form.submitting}
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={form.password}
          onChangeText={form.setPassword}
          error={form.fieldErrors.password}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          editable={!form.submitting}
          onSubmitEditing={() => void form.submit()}
        />
        {form.formError ? <Banner tone="error" message={form.formError} testID="login-error" /> : null}
        <Button
          label="Sign in"
          loadingLabel="Signing in…"
          loading={form.submitting}
          onPress={() => void form.submit()}
        />
        {showGoogle ? (
          <>
            <AppText tone="muted" style={{ textAlign: 'center' }}>
              or continue with
            </AppText>
            <Button
              variant="secondary"
              label="Sign in with Google"
              loadingLabel="Signing in…"
              loading={form.submitting}
              onPress={() => void form.submitGoogle()}
              testID="google-sign-in"
            />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
