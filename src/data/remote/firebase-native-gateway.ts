/**
 * Native Firebase/Google implementation of FirebaseAuthGateway. Importing this
 * module touches the native modules, so only `createFirebaseAuthGateway` loads
 * it, and only in REST mode. Mock mode never loads it, so it still runs in
 * Expo Go or in a dev build made before Firebase was added.
 */
import {
  getAuth,
  getIdToken,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { AppError } from '@/core/errors';

import {
  mapFirebaseAuthError,
  mapGoogleSignInError,
  type FirebaseAuthGateway,
  type FirebaseUserInfo,
} from './firebase-auth-gateway';

function toUserInfo(user: FirebaseUser): FirebaseUserInfo {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export function createNativeFirebaseAuthGateway(googleWebClientId: string): FirebaseAuthGateway {
  let googleConfigured = false;
  const configureGoogle = () => {
    if (googleConfigured) return;
    GoogleSignin.configure({ webClientId: googleWebClientId });
    googleConfigured = true;
  };

  return {
    async signInWithEmail(email, password) {
      try {
        const { user } = await signInWithEmailAndPassword(getAuth(), email, password);
        return toUserInfo(user);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },

    // Account picker -> Google ID token -> Firebase credential.
    async signInWithGoogle() {
      try {
        configureGoogle();
        try {
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        } catch (cause) {
          throw new Error('Google Play Services not available.', { cause });
        }
        const response = await GoogleSignin.signIn();
        if (!isSuccessResponse(response)) return null;
        const { idToken } = response.data;
        if (!idToken) {
          throw new AppError('sign_in_failed', 'Google sign-in did not return an ID token.');
        }
        const { user } = await signInWithCredential(getAuth(), GoogleAuthProvider.credential(idToken));
        return toUserInfo(user);
      } catch (error) {
        const mapped = mapGoogleSignInError(error);
        if (mapped === null) return null;
        throw mapped;
      }
    },

    getCurrentUser() {
      return new Promise((resolve, reject) => {
        try {
          // The first callback reports the restored user (or null) once Firebase is ready.
          const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
            unsubscribe();
            resolve(user ? toUserInfo(user) : null);
          });
        } catch (cause) {
          reject(new AppError('config', 'Firebase Auth is unavailable.', { cause }));
        }
      });
    },

    async getIdToken(forceRefresh) {
      const user = getAuth().currentUser;
      if (!user) throw new AppError('unauthorized', 'No authenticated Firebase user.');
      try {
        return await getIdToken(user, forceRefresh);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },

    async signOut() {
      if (!getAuth().currentUser) return;
      try {
        await signOut(getAuth());
      } catch (cause) {
        throw new AppError('unknown', 'Firebase sign-out failed.', { cause });
      }
    },

    async signOutGoogle() {
      try {
        configureGoogle();
        await GoogleSignin.signOut();
      } catch {
        // Non-fatal: the Firebase session is still cleared.
      }
    },
  };
}
