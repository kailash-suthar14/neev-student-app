/**
 * Repository contracts. Feature services depend only on these interfaces;
 * mock and REST implementations are selected in `src/config/container.ts`.
 *
 * All methods reject with an `AppError` on failure. None of them report
 * success unless the underlying store or server has confirmed the operation.
 */
import type { AccountInfo } from '@/features/account/models';
import type { AuthSession, LoginCredentials } from '@/features/auth/models';
import type {
  Survey,
  SurveyDraft,
  SurveySubmission,
  SurveySummary,
} from '@/features/surveys/models';

export interface AuthRepository {
  /** Rejects with `invalid_credentials` when the credentials are not accepted. */
  login(credentials: LoginCredentials): Promise<AuthSession>;
  /**
   * Google account sign-in, where supported. Resolves null when the user
   * dismisses the account picker.
   */
  loginWithGoogle?(): Promise<AuthSession | null>;
  logout(): Promise<void>;
  /** Returns the persisted session, or null when none exists or it has expired. */
  getCurrentSession(): Promise<AuthSession | null>;
  /**
   * True once after this device was signed out because the account signed in
   * on another device. Reading it clears it.
   */
  consumeForcedSignOut?(): Promise<boolean>;
}

export interface AccountRepository {
  /** The signed-in user's account. Rejects with `unauthorized` when the session has ended. */
  getAccountInfo(): Promise<AccountInfo>;
}

export interface SurveyRepository {
  listSurveys(): Promise<SurveySummary[]>;
  /** Rejects with `not_found` for an unknown survey. */
  getSurvey(surveyId: string): Promise<Survey>;
}

export interface SubmissionRepository {
  /**
   * Persists a new submission and resolves with the stored copy. The
   * submission ID doubles as an idempotency key; re-sending the same ID
   * must not create a duplicate.
   */
  create(submission: SurveySubmission): Promise<SurveySubmission>;
  getById(submissionId: string): Promise<SurveySubmission | null>;
  /** Newest first. */
  listBySurvey(surveyId: string): Promise<SurveySubmission[]>;
}

/**
 * Local-only storage for unsubmitted answers, scoped per respondent and
 * survey so users sharing a device never see or overwrite each other's drafts.
 * Never synced to a server.
 */
export interface DraftRepository {
  get(surveyId: string, respondentId: string | null): Promise<SurveyDraft | null>;
  save(draft: SurveyDraft): Promise<void>;
  remove(surveyId: string, respondentId: string | null): Promise<void>;
}
