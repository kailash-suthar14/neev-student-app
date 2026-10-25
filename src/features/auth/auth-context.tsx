import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAppServices } from '@/config/app-services';
import { toAppError, type AppError } from '@/core/errors';

import type { AuthSession, LoginCredentials } from './models';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'restore_failed'; error: AppError }
  | { status: 'signed_out'; notice?: string }
  | { status: 'signed_in'; session: AuthSession };

export interface AuthContextValue {
  state: AuthState;
  /** Resolves on success; rejects with an AppError the caller can display. */
  signIn(credentials: LoginCredentials): Promise<void>;
  signOut(): Promise<void>;
  /** Called when the backend reports an expired session (HTTP 401). */
  expireSession(): void;
  retryRestore(): void;
  /** Leave a failed restore and go to the login screen. */
  continueSignedOut(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { auth } = useAppServices();
  const [state, setState] = useState<AuthState>({ status: 'restoring' });
  const [restoreAttempt, setRestoreAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    auth.restoreSession().then(
      (session) => {
        if (active) setState(session ? { status: 'signed_in', session } : { status: 'signed_out' });
      },
      (error: unknown) => {
        if (active) setState({ status: 'restore_failed', error: toAppError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [auth, restoreAttempt]);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      const session = await auth.login(credentials);
      setState({ status: 'signed_in', session });
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
      setState({ status: 'signed_out' });
    } catch (error) {
      // The local session could not be cleared; stay signed out in memory but
      // tell the user, since they may be restored as signed-in on next launch.
      setState({
        status: 'signed_out',
        notice: 'You were signed out, but this device could not forget the session. Sign out again later.',
      });
      throw toAppError(error);
    }
  }, [auth]);

  const expireSession = useCallback(() => {
    setState({ status: 'signed_out', notice: 'Your session has expired. Please sign in again.' });
    auth.logout().catch(() => undefined);
  }, [auth]);

  const retryRestore = useCallback(() => {
    setState({ status: 'restoring' });
    setRestoreAttempt((n) => n + 1);
  }, []);

  const continueSignedOut = useCallback(() => setState({ status: 'signed_out' }), []);

  return (
    <AuthContext
      value={{ state, signIn, signOut, expireSession, retryRestore, continueSignedOut }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/**
 * The signed-in session, for screens inside the protected (app) group.
 * After sign-out the navigator may keep a protected screen mounted briefly
 * while it animates away; it keeps rendering with the last known session
 * instead of crashing.
 */
export function useSession(): AuthSession {
  const { state } = useAuth();
  const live = state.status === 'signed_in' ? state.session : null;
  const [last, setLast] = useState<AuthSession | null>(live);
  // Store the latest session (React's "information from previous renders" pattern).
  if (live && live !== last) setLast(live);
  const session = live ?? last;
  if (!session) throw new Error('useSession requires a signed-in user.');
  return session;
}
