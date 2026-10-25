import { createAppServices } from '@/config/container';
import { parseAppConfig } from '@/config/env';
import { InMemoryStorage } from '@/data/local/key-value-storage';

import { fixedClock, sequentialIds, VALID_SEED_VALUES } from '../helpers/fixtures';
import { createMockFetch, jsonResponse } from '../helpers/http';

describe('parseAppConfig', () => {
  it('defaults to offline mock mode with demo credentials', () => {
    expect(parseAppConfig({})).toEqual({
      appName: 'Neev Survey',
      dataMode: 'mock',
      api: null,
      mock: { latencyMs: 400, demoEmail: 'demo@example.com', demoPassword: 'Demo123!' },
    });
  });

  it('treats blank variables as unset', () => {
    expect(parseAppConfig({ EXPO_PUBLIC_DATA_MODE: '', EXPO_PUBLIC_APP_NAME: ' ' }).dataMode).toBe('mock');
  });

  it('requires an API base URL in REST mode', () => {
    expect(() => parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest' })).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });

  it('rejects non-http base URLs and unknown modes', () => {
    expect(() =>
      parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'rest', EXPO_PUBLIC_API_BASE_URL: 'ftp://x.test' }),
    ).toThrow();
    expect(() => parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'graphql' })).toThrow();
  });

  it('requires an explicit data mode in release builds', () => {
    expect(() => parseAppConfig({}, { isDev: false })).toThrow(/must be set explicitly/);
    expect(parseAppConfig({ EXPO_PUBLIC_DATA_MODE: 'mock' }, { isDev: false }).dataMode).toBe('mock');
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
    const config = { ...parseAppConfig({}), mock: { ...parseAppConfig({}).mock, latencyMs: 0 } };
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
});
