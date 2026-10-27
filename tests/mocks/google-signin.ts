/**
 * Jest stand-in for @react-native-google-signin/google-signin. The status
 * codes and type guards mirror the real module so error mapping can be tested.
 */
const unavailable = () => {
  throw new Error('Google Sign-In is not available in tests. Inject a FirebaseAuthGateway.');
};

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
};

export const GoogleSignin = {
  configure: unavailable,
  hasPlayServices: unavailable,
  signIn: unavailable,
  signOut: unavailable,
};

export function isErrorWithCode(error: unknown): error is { code: string; message: string } {
  return error instanceof Error && 'code' in error;
}

export function isSuccessResponse(response: { type?: string }): boolean {
  return response.type === 'success';
}
