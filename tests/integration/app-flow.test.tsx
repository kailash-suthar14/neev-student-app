import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

import { StorageKeys } from '@/data/local/storage-keys';

// The real route files under src/app, including the root layout and composition root.
const APP_ROUTES = 'src/app';

const DEMO = { email: 'demo@example.com', password: 'Demo123!' };

function storedSession() {
  const now = Date.now();
  return JSON.stringify({
    schemaVersion: 1,
    data: {
      user: { id: 'user_demo', email: DEMO.email, displayName: 'Demo Student' },
      mode: 'mock',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    },
  });
}

async function startSignedIn() {
  await AsyncStorage.setItem(StorageKeys.session, storedSession());
  const router = await renderRouter(APP_ROUTES, { initialUrl: '/' });
  await screen.findByText('Welcome, Demo Student');
  return router;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('splash and authentication', () => {
  it('routes an unauthenticated user to the login screen', async () => {
    const router = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/login');
    expect(screen.getByTestId('mock-auth-banner')).toBeOnTheScreen();
  });

  it('shows field errors for empty input', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required.')).toBeOnTheScreen();
    expect(screen.getByText('Password is required.')).toBeOnTheScreen();
  });

  it('rejects invalid credentials and clears the password', async () => {
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), DEMO.email);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('The email or password is incorrect.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Password').props.value).toBe('');
    expect(await AsyncStorage.getItem(StorageKeys.session)).toBeNull();
  });

  it('signs in with the demo credentials and shows the account details', async () => {
    const router = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), DEMO.email);
    await fireEvent.changeText(screen.getByLabelText('Password'), DEMO.password);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome, Demo Student')).toBeOnTheScreen();
    const account = within(await screen.findByTestId('account-details'));
    expect(await account.findByText('Demo Student')).toBeOnTheScreen();
    // Mock accounts use the email as the username too.
    expect(account.getAllByText('demo@example.com')).toHaveLength(2);
    expect(account.getByText('student')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    const stored = (await AsyncStorage.getItem(StorageKeys.session)) ?? '';
    expect(stored).not.toContain(DEMO.password);
  });

  it('restores a saved session straight to the home screen', async () => {
    const router = await startSignedIn();
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeOnTheScreen();
  });

  it('logs out back to the login screen', async () => {
    const router = await startSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/login');
    expect(await AsyncStorage.getItem(StorageKeys.session)).toBeNull();
  });

  it('shows a recoverable error when the session cannot be read', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('io'));
    await renderRouter(APP_ROUTES, { initialUrl: '/' });
    expect(await screen.findByText('We could not restore your session')).toBeOnTheScreen();

    getItem.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  });
});

describe('home screen', () => {
  it('shows only the account details, no survey', async () => {
    await startSignedIn();
    const account = within(await screen.findByTestId('account-details'));
    expect(await account.findByText('Active')).toBeOnTheScreen();
    expect(screen.queryByText('Learning Experience Survey')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Submit survey' })).not.toBeOnTheScreen();
  });
});
