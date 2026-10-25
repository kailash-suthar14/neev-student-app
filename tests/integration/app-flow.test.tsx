import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { StorageKeys } from '@/data/local/storage-keys';
import { surveySubmissionSchema } from '@/features/surveys/models';

// The real route files under src/app, including the root layout and composition root.
const APP_ROUTES = 'src/app';

const DEMO = { email: 'demo@example.com', password: 'Demo123!' };

/** Simulates closing the app: unmount everything, keep device storage. */
async function restartApp() {
  await cleanup();
  await renderRouter(APP_ROUTES, { initialUrl: '/' });
}

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

async function storedSubmissions() {
  const raw = await AsyncStorage.getItem(StorageKeys.submissions);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { data: unknown[] };
  return parsed.data.map((s) => surveySubmissionSchema.parse(s));
}

async function startSignedIn() {
  await AsyncStorage.setItem(StorageKeys.session, storedSession());
  const router = await renderRouter(APP_ROUTES, { initialUrl: '/' });
  await screen.findByText('Learning Experience Survey');
  return router;
}

async function answerRequiredQuestions() {
  await fireEvent.press(screen.getByRole('radio', { name: 'Intermediate' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Practice tests' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Live classes' }));
  await fireEvent.changeText(
    screen.getByLabelText('On average, how many hours do you study outside class each week?'),
    '12',
  );
  await fireEvent.press(screen.getByRole('radio', { name: 'Rating 4' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
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

  it('signs in with the demo credentials and opens the survey', async () => {
    const router = await renderRouter(APP_ROUTES, { initialUrl: '/' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), DEMO.email);
    await fireEvent.changeText(screen.getByLabelText('Password'), DEMO.password);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome, Demo Student')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    const stored = (await AsyncStorage.getItem(StorageKeys.session)) ?? '';
    expect(stored).not.toContain(DEMO.password);
  });

  it('restores a saved session straight to the survey', async () => {
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

describe('survey landing', () => {
  it('shows the survey intro, question count and not-started status', async () => {
    await startSignedIn();
    expect(screen.getByText(/7 questions/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Not started')).toBeOnTheScreen();
    expect(screen.getByText('0 of 7 answered · 5 required remaining')).toBeOnTheScreen();
  });

  it('shows inline validation errors and keeps entered answers', async () => {
    await startSignedIn();
    await fireEvent.press(screen.getByRole('radio', { name: 'Advanced' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));

    expect(await screen.findByTestId('validation-summary')).toBeOnTheScreen();
    expect(screen.getByText('4 questions need attention.')).toBeOnTheScreen();
    expect(screen.getByText('Select at least one option.')).toBeOnTheScreen();
    expect(screen.getByText('Please choose a rating.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Advanced' })).toBeChecked();
    expect(await storedSubmissions()).toEqual([]);
  });

  it('clears a question error once it is answered', async () => {
    await startSignedIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
    expect(await screen.findByText('Please choose a rating.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Rating 2' }));
    expect(screen.queryByText('Please choose a rating.')).not.toBeOnTheScreen();
  });

  it('validates numeric input', async () => {
    await startSignedIn();
    await answerRequiredQuestions();
    await fireEvent.changeText(
      screen.getByLabelText('On average, how many hours do you study outside class each week?'),
      '200',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
    expect(await screen.findByText('Enter a number no greater than 80.')).toBeOnTheScreen();
  });

  it('submits valid answers, persists them and shows a summary', async () => {
    const router = await startSignedIn();
    await answerRequiredQuestions();
    await fireEvent.changeText(
      screen.getByLabelText('Which topic have you enjoyed the most so far?'),
      'Geometry',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));

    expect(await screen.findByTestId('submission-success')).toBeOnTheScreen();
    expect(screen.getByText('Live classes, Practice tests')).toBeOnTheScreen();
    expect(screen.getByText('12 hours')).toBeOnTheScreen();
    expect(screen.getByText('Geometry')).toBeOnTheScreen();

    const saved = await storedSubmissions();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ respondentId: 'user_demo', status: 'submitted' });

    await fireEvent.press(screen.getByRole('button', { name: 'View saved submission' }));
    expect(await screen.findByText(`Reference: ${saved[0].id}`)).toBeOnTheScreen();
    expect(router.getPathname()).toBe(`/submissions/${saved[0].id}`);
  });

  it('marks the survey as submitted after an app restart', async () => {
    await startSignedIn();
    await answerRequiredQuestions();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
    await screen.findByTestId('submission-success');
    await restartApp();
    expect(await screen.findByText('Already submitted')).toBeOnTheScreen();
    expect(screen.getByLabelText('Status: Submitted')).toBeOnTheScreen();
  });

  it('disables submit while saving and stores only one submission', async () => {
    await startSignedIn();
    await answerRequiredQuestions();

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let writeStarted = false;
    const realSetItem = AsyncStorage.setItem.bind(AsyncStorage);
    jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
      if (key === StorageKeys.submissions) {
        writeStarted = true;
        await gate;
      }
      return realSetItem(key, value);
    });

    try {
      await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
      await waitFor(() => expect(writeStarted).toBe(true));
      const busy = screen.getByRole('button', { name: 'Submitting…' });
      expect(busy).toBeDisabled();
      await fireEvent.press(busy);
      await fireEvent.press(busy);
    } finally {
      release();
    }

    expect(await screen.findByTestId('submission-success')).toBeOnTheScreen();
    expect(await storedSubmissions()).toHaveLength(1);
  });

  it('reports a storage failure and keeps answers for retry', async () => {
    await startSignedIn();
    await answerRequiredQuestions();
    const realSetItem = AsyncStorage.setItem.bind(AsyncStorage);
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockImplementation(async (key, value) => {
      if (key === StorageKeys.submissions) throw new Error('disk full');
      return realSetItem(key, value);
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
    expect(await screen.findByTestId('submit-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('submission-success')).not.toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Intermediate' })).toBeChecked();

    spy.mockRestore();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit survey' }));
    expect(await screen.findByTestId('submission-success')).toBeOnTheScreen();
    expect(await storedSubmissions()).toHaveLength(1);
  });

  it('restores draft answers after a restart', async () => {
    jest.useFakeTimers();
    try {
      await startSignedIn();
      await fireEvent.press(screen.getByRole('radio', { name: 'Advanced' }));
      jest.advanceTimersByTime(1000);
      await waitFor(async () => expect(await AsyncStorage.getItem(StorageKeys.drafts)).not.toBeNull());
      await restartApp();
      await screen.findByText('Learning Experience Survey');
      expect(screen.getByRole('radio', { name: 'Advanced' })).toBeChecked();
      expect(screen.getByLabelText('Status: In progress')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('saves a pending draft when the screen unmounts before autosave fires', async () => {
    await startSignedIn();
    await fireEvent.press(screen.getByRole('radio', { name: 'Foundation' }));
    // No timer advance: the debounced save has not run yet.
    await restartApp();
    await screen.findByText('Learning Experience Survey');
    expect(screen.getByRole('radio', { name: 'Foundation' })).toBeChecked();
  });
});
