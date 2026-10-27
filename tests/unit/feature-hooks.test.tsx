import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { AppServicesProvider } from '@/config/app-services';
import { createAppServices } from '@/config/container';
import { parseAppConfig } from '@/config/env';
import { InMemoryStorage } from '@/data/local/key-value-storage';
import { useAccountInfo } from '@/features/account/use-account-info';
import { AuthProvider } from '@/features/auth/auth-context';
import { useLoginForm } from '@/features/auth/use-login-form';
import { useSubmissionDetail } from '@/features/surveys/use-submission-detail';

import { FakeFirebaseAuth, STUDENT_USER } from '../helpers/firebase';
import { createMockFetch, jsonResponse } from '../helpers/http';

const REST_ENV = { EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'https://api.test' };

function restWrapper(...responders: Parameters<typeof createMockFetch>) {
  const { fetchFn } = createMockFetch(...responders);
  const services = createAppServices(parseAppConfig(REST_ENV), {
    storage: new InMemoryStorage(),
    secureStorage: new InMemoryStorage(),
    fetchFn,
    firebaseAuth: new FakeFirebaseAuth(),
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <AppServicesProvider services={services}>
        <AuthProvider>{children}</AuthProvider>
      </AppServicesProvider>
    );
  };
}

describe('useLoginForm', () => {
  it('shows a form-level error when the server rejects with unrelated field details', async () => {
    const { result } = await renderHook(() => useLoginForm(), {
      wrapper: restWrapper(() =>
        jsonResponse(422, { error: { code: 'invalid', message: 'x', details: { credentials: 'Locked' } } }),
      ),
    });
    // Firebase accepts the credentials; the backend token exchange then rejects them.
    await act(async () => {
      result.current.setEmail(STUDENT_USER.email!);
      result.current.setPassword('Secret123!');
    });
    await act(() => result.current.submit());

    expect(result.current.formError).toBe('Please check the highlighted fields.');
    expect(result.current.fieldErrors).toEqual({});
  });
});

describe('useSubmissionDetail', () => {
  it('reports an expired session (HTTP 401) so the user is sent back to sign in', async () => {
    const onUnauthorized = jest.fn();
    const { result } = await renderHook(() => useSubmissionDetail('sub_1', 'user_1', onUnauthorized), {
      wrapper: restWrapper(() => jsonResponse(401)),
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('useAccountInfo', () => {
  it('loads the account details from the backend', async () => {
    const { result } = await renderHook(() => useAccountInfo(), {
      wrapper: restWrapper(() =>
        jsonResponse(200, { name: 'Asha', email: 'asha@example.com', roles: ['student'], isActive: true }),
      ),
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toMatchObject({
      account: { name: 'Asha', email: 'asha@example.com', roles: ['student'], isActive: true },
    });
  });

  it('reports an expired session (HTTP 401) so the user is sent back to sign in', async () => {
    const onUnauthorized = jest.fn();
    const { result } = await renderHook(() => useAccountInfo(onUnauthorized), {
      wrapper: restWrapper(() => jsonResponse(401)),
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
