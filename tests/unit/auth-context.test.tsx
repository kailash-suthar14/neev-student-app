import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type PropsWithChildren } from 'react';

import { AppServicesProvider } from '@/config/app-services';
import { createAppServices } from '@/config/container';
import { parseAppConfig } from '@/config/env';
import { InMemoryStorage } from '@/data/local/key-value-storage';
import {
  AuthProvider,
  useAuth,
  useSession,
  type AuthContextValue,
} from '@/features/auth/auth-context';

import { FailingStorage } from '../helpers/fixtures';

function wrapperFor(storage = new InMemoryStorage() as InMemoryStorage | FailingStorage) {
  const services = createAppServices(parseAppConfig({ EXPO_PUBLIC_MOCK_LATENCY_MS: '0' }), { storage });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <AppServicesProvider services={services}>
        <AuthProvider>{children}</AuthProvider>
      </AppServicesProvider>
    );
  };
}

const DEMO = { email: 'demo@example.com', password: 'Demo123!' };

describe('AuthProvider', () => {
  it('restores to signed out, signs in and signs out', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'));

    await act(() => result.current.signIn(DEMO));
    expect(result.current.state).toMatchObject({ status: 'signed_in', session: { user: { id: 'user_demo' } } });

    await act(() => result.current.signOut());
    expect(result.current.state.status).toBe('signed_out');
  });

  it('keeps returning the last session from useSession while a protected screen unmounts', async () => {
    const seen: string[] = [];
    let auth: AuthContextValue | undefined;

    /** Mimics the navigator keeping a protected screen mounted during its exit animation. */
    function Harness() {
      auth = useAuth();
      const [mounted, setMounted] = useState(false);
      if (auth.state.status === 'signed_in' && !mounted) setMounted(true);
      return mounted ? <ProtectedScreen /> : null;
    }
    function ProtectedScreen() {
      seen.push(useSession().user.id);
      return null;
    }

    await render(<Harness />, { wrapper: wrapperFor() });
    await waitFor(() => expect(auth?.state.status).toBe('signed_out'));
    await act(() => auth!.signIn(DEMO));
    await act(() => auth!.signOut());

    expect(auth?.state.status).toBe('signed_out');
    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen)).toEqual(new Set(['user_demo']));
  });

  it('reports a restore failure and recovers on retry', async () => {
    const storage = new FailingStorage();
    storage.failReads = true;
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapperFor(storage) });
    await waitFor(() => expect(result.current.state.status).toBe('restore_failed'));

    storage.failReads = false;
    await act(async () => result.current.retryRestore());
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'));
  });

  it('signs out with a notice when the session expires', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.state.status).toBe('signed_out'));
    await act(() => result.current.signIn(DEMO));
    await act(async () => result.current.expireSession());
    expect(result.current.state).toEqual({
      status: 'signed_out',
      notice: 'Your session has expired. Please sign in again.',
    });
  });
});
