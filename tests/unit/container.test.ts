import { createAppServices } from '@/config/container';
import { parseAppConfig } from '@/config/env';
import { InMemoryStorage } from '@/data/local/key-value-storage';

import { accountInfo, exchangeOk, FakeFirebaseAuth } from '../helpers/firebase';
import { fixedClock, sequentialIds, VALID_SEED_VALUES } from '../helpers/fixtures';
import { createMockFetch, jsonResponse } from '../helpers/http';

const MOCK_ENV = { EXPO_PUBLIC_DATA_MODE: 'mock' };

describe('parseAppConfig', () => {
  it('defaults to the real (REST) sign-in', () => {
    expect(parseAppConfig({ EXPO_PUBLIC_API_BASE_URL: 'https://api.test' })).toEqual({
      appName: 'Neev Survey',
      dataMode: 'rest',
      api: { baseUrl: 'https://api.test', timeoutMs: 15000 },
      mock: { latencyMs: 400, demoEmail: 'demo@example.com', demoPassword: 'Demo123!' },
      firebase: {
        googleWebClientId: '865517437629-d4shk01d3it2im6u1p8mbl5l7od08thf.apps.googleusercontent.com',
      },
    });
  });

  it('validates the Google web client id', () => {
    expect(() => parseAppConfig({ ...MOCK_ENV, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'not-a-client-id' })).toThrow(
      /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID/,
    );
    expect(
      parseAppConfig({ ...MOCK_ENV, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'abc.apps.googleusercontent.com' }).firebase,
    ).toEqual({ googleWebClientId: 'abc.apps.googleusercontent.com' });
  });

  it('treats blank variables as unset', () => {
    const config = parseAppConfig({
      EXPO_PUBLIC_DATA_MODE: '',
      EXPO_PUBLIC_APP_NAME: ' ',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.test',
    });
    expect(config).toMatchObject({ dataMode: 'rest', appName: 'Neev Survey' });
  });

  it('requires an API base URL in REST mode', () => {
    expect(() => parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest' })).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
    expect(() => parseAppConfig({})).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });

  it('rejects non-http base URLs and unknown modes', () => {
    expect(() =>
      parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'ftp://x.test' }),
    ).toThrow();
    expect(() => parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'graphql' })).toThrow();
  });

  it('refuses the mock login in release builds', () => {
    expect(() => parseAppConfig(MOCK_ENV, { isDev: false })).toThrow(/development only/);
    expect(
      parseAppConfig({ EXPO_PUBLIC_API_BASE_URL: 'https://api.test' }, { isDev: false }).dataMode,
    ).toBe('rest');
  });

  it('rejects plain-http APIs in release builds only', () => {
    const env = { EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000' };
    expect(parseAppConfig(env, { isDev: true }).api?.baseUrl).toBe('http://10.0.2.2:3000');
    expect(() => parseAppConfig(env, { isDev: false })).toThrow(/https/);
  });

  it('parses REST configuration', () => {
    const config = parseAppConfig({
      EXPO_PUBLIC_DATA_MODE: 'rest',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com/v1',
      EXPO_PUBLIC_API_TIMEOUT_MS: '5000',
    });
    expect(config.api).toEqual({ baseUrl: 'https://api.example.com/v1', timeoutMs: 5000 });
  });
});

describe('createAppServices', () => {
  it('runs the full mock flow without any network access', async () => {
    const { fetchFn } = createMockFetch();
    const globalFetch = jest.spyOn(globalThis, 'fetch');
    const config = parseAppConfig({ ...MOCK_ENV, EXPO_PUBLIC_MOCK_LATENCY_MS: '0' });
    const services = createAppServices(config, {
      storage: new InMemoryStorage(),
      fetchFn,
      clock: fixedClock(),
      createId: sequentialIds(),
    });

    const session = await services.auth.login({ email: 'demo@example.com', password: 'Demo123!' });
    const survey = await services.surveys.getFeaturedSurvey();
    if (!survey) throw new Error('expected a survey');
    await services.surveys.saveDraft(survey, session.user.id, VALID_SEED_VALUES);
    await services.surveys.submit({ survey, values: VALID_SEED_VALUES, respondentId: session.user.id });
    await services.auth.logout();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it('uses REST repositories and the injected fetch in REST mode', async () => {
    const { fetchFn, requests } = createMockFetch(() => jsonResponse(200, { data: [] }));
    const services = createAppServices(
      parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'https://api.test' }),
      { storage: new InMemoryStorage(), fetchFn },
    );
    await expect(services.surveys.getFeaturedSurvey()).resolves.toBeNull();
    expect(requests[0].url).toBe('https://api.test/surveys');
  });

  it('signs in through Firebase in REST mode and sends the session token afterwards', async () => {
    const { fetchFn, requests } = createMockFetch(
      () => exchangeOk('session-1'),
      () => accountInfo(),
      () => jsonResponse(200, { data: [] }),
    );
    const secureStorage = new InMemoryStorage();
    const services = createAppServices(
      parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'https://api.test' }),
      { storage: new InMemoryStorage(), secureStorage, fetchFn, firebaseAuth: new FakeFirebaseAuth() },
    );

    expect(services.auth.supportsGoogleSignIn).toBe(true);
    await expect(
      services.auth.login({ email: 'Student@Example.com', password: 'Secret123!' }),
    ).resolves.toMatchObject({ mode: 'rest', user: { email: 'student@example.com' } });
    await services.surveys.getFeaturedSurvey();

    expect(requests[2].headers['X-Auth-Token']).toBe('session-1');
    expect(secureStorage.keys()).toContain('survey-app.v1.x-auth-token');
  });

  it('does not offer Google Sign-In in mock mode', () => {
    const services = createAppServices(parseAppConfig(MOCK_ENV), { storage: new InMemoryStorage() });
    expect(services.auth.supportsGoogleSignIn).toBe(false);
  });
});

// Expo Go, or a dev build made before Firebase was added, has no RNFirebase
// native module: importing @react-native-firebase/* throws at module load.
describe('createAppServices without the native Firebase modules', () => {
  const nativeMissing = () => {
    throw new Error('Native module NativeRNFBTurboApp is not registered.');
  };

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@react-native-firebase/auth');
  });

  function loadIsolated() {
    jest.resetModules();
    jest.doMock('@react-native-firebase/auth', nativeMissing);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const container = require('@/config/container') as typeof import('@/config/container');
    const env = require('@/config/env') as typeof import('@/config/env');
    const errors = require('@/core/errors') as typeof import('@/core/errors');
    /* eslint-enable @typescript-eslint/no-require-imports */
    return { ...container, ...env, ...errors };
  }

  it('still starts in mock mode', () => {
    const { createAppServices: create, parseAppConfig: parse } = loadIsolated();
    expect(() => create(parse(MOCK_ENV), { storage: new InMemoryStorage() })).not.toThrow();
  });

  it('reports a config error, not a crash, in REST mode', () => {
    const { createAppServices: create, parseAppConfig: parse, isAppError } = loadIsolated();
    const config = parse({ EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'https://api.test' });
    let thrown: unknown;
    try {
      create(config, { storage: new InMemoryStorage(), secureStorage: new InMemoryStorage() });
    } catch (error) {
      thrown = error;
    }
    expect(isAppError(thrown) && thrown.code).toBe('config');
  });
});
