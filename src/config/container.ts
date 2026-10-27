/**
 * Composition root: the ONLY place that chooses concrete repository
 * implementations. Everything else depends on interfaces.
 */
import { AppError } from '@/core/errors';
import type { Clock, IdGenerator } from '@/core/runtime';
import {
  createAsyncStorageAdapter,
  type KeyValueStorage,
} from '@/data/local/key-value-storage';
import { LocalDraftRepository } from '@/data/local/local-draft-repository';
import { LocalSubmissionStore } from '@/data/local/local-submission-store';
import { createSecureStoreAdapter } from '@/data/local/secure-storage';
import { SessionStore } from '@/data/local/session-store';
import type { DataIssueReporter } from '@/data/local/versioned-json-store';
import { MockAccountRepository } from '@/data/mock/mock-account-repository';
import { MockAuthRepository } from '@/data/mock/mock-auth-repository';
import { MockSubmissionRepository } from '@/data/mock/mock-submission-repository';
import { MockSurveyRepository } from '@/data/mock/mock-survey-repository';
import { ApiClient, type FetchFn } from '@/data/remote/api-client';
import { AuthCredentialStore } from '@/data/remote/credential-store';
import {
  createFirebaseAuthGateway,
  type FirebaseAuthGateway,
} from '@/data/remote/firebase-auth-gateway';
import { FirebaseAuthRepository } from '@/data/remote/firebase-auth-repository';
import { RestAccountRepository } from '@/data/remote/rest-account-repository';
import { RestSubmissionRepository } from '@/data/remote/rest-submission-repository';
import { RestSurveyRepository } from '@/data/remote/rest-survey-repository';
import type {
  AccountRepository,
  AuthRepository,
  SubmissionRepository,
  SurveyRepository,
} from '@/data/repositories';
import { AccountService } from '@/features/account/account-service';
import { AuthService } from '@/features/auth/auth-service';
import { SurveyService } from '@/features/surveys/survey-service';

import type { AppConfig } from './env';

export interface AppServices {
  config: AppConfig;
  auth: AuthService;
  account: AccountService;
  surveys: SurveyService;
}

export interface ContainerOverrides {
  storage?: KeyValueStorage;
  /** Used only in REST mode. Mock mode never touches the network. */
  fetchFn?: FetchFn;
  /** REST mode: encrypted storage for the session token. Defaults to expo-secure-store. */
  secureStorage?: KeyValueStorage;
  /** REST mode: Firebase/Google sign-in. Defaults to the native modules. */
  firebaseAuth?: FirebaseAuthGateway;
  clock?: Clock;
  createId?: IdGenerator;
  onDataIssue?: DataIssueReporter;
}

/** Logs only the storage key and reason; stored values are never logged. */
const defaultDataIssueReporter: DataIssueReporter = ({ key, reason }) => {
  if (__DEV__) console.warn(`[storage] Quarantined unreadable data at "${key}" (${reason}).`);
};

interface Repositories {
  auth: AuthRepository;
  account: AccountRepository;
  surveys: SurveyRepository;
  submissions: SubmissionRepository;
}

function createMockRepositories(
  config: AppConfig,
  storage: KeyValueStorage,
  overrides: ContainerOverrides,
  onDataIssue: DataIssueReporter,
): Repositories {
  const { latencyMs, demoEmail, demoPassword } = config.mock;
  const sessionStore = new SessionStore(storage, onDataIssue);
  return {
    auth: new MockAuthRepository({
      demoEmail,
      demoPassword,
      sessionStore,
      clock: overrides.clock,
      latencyMs,
    }),
    account: new MockAccountRepository(sessionStore, latencyMs),
    surveys: new MockSurveyRepository(undefined, latencyMs),
    submissions: new MockSubmissionRepository(
      new LocalSubmissionStore(storage, { clock: overrides.clock, onDataIssue }),
      latencyMs,
    ),
  };
}

function createRestRepositories(
  config: AppConfig,
  storage: KeyValueStorage,
  overrides: ContainerOverrides,
  onDataIssue: DataIssueReporter,
): Repositories {
  if (!config.api) {
    throw new AppError('config', 'REST mode requires EXPO_PUBLIC_API_BASE_URL.');
  }
  const fetchFn: FetchFn = overrides.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  const credentials = new AuthCredentialStore(
    overrides.secureStorage ?? createSecureStoreAdapter(),
    overrides.createId,
  );
  const client: ApiClient = new ApiClient({
    baseUrl: config.api.baseUrl,
    timeoutMs: config.api.timeoutMs,
    fetchFn,
    getAccessToken: () => credentials.getToken(),
    // `auth` is assigned below; this only runs after a request has been made.
    reauthenticate: (): Promise<string> => auth.reauthenticate(),
  });
  const auth: FirebaseAuthRepository = new FirebaseAuthRepository({
    client,
    firebase: overrides.firebaseAuth ?? createFirebaseAuthGateway(config.firebase.googleWebClientId),
    credentials,
    sessionStore: new SessionStore(storage, onDataIssue),
    clock: overrides.clock,
  });
  return {
    auth,
    account: new RestAccountRepository(client),
    surveys: new RestSurveyRepository(client),
    submissions: new RestSubmissionRepository(client),
  };
}

export function createAppServices(config: AppConfig, overrides: ContainerOverrides = {}): AppServices {
  const storage = overrides.storage ?? createAsyncStorageAdapter();
  const onDataIssue = overrides.onDataIssue ?? defaultDataIssueReporter;
  const repos =
    config.dataMode === 'rest'
      ? createRestRepositories(config, storage, overrides, onDataIssue)
      : createMockRepositories(config, storage, overrides, onDataIssue);

  return {
    config,
    auth: new AuthService(repos.auth),
    account: new AccountService(repos.account),
    surveys: new SurveyService({
      surveys: repos.surveys,
      submissions: repos.submissions,
      // Drafts are always device-local, in both modes.
      drafts: new LocalDraftRepository(storage, onDataIssue),
      clock: overrides.clock,
      createId: overrides.createId,
    }),
  };
}
