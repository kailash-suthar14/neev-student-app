/**
 * Jest stand-in for @react-native-firebase/auth, which needs native code.
 * Tests inject a fake `FirebaseAuthGateway` instead; these only have to load.
 */
const unavailable = () => {
  throw new Error('@react-native-firebase/auth is not available in tests. Inject a FirebaseAuthGateway.');
};

export const getAuth = unavailable;
export const getIdToken = unavailable;
export const onAuthStateChanged = unavailable;
export const signInWithCredential = unavailable;
export const signInWithEmailAndPassword = unavailable;
export const signOut = unavailable;
export const GoogleAuthProvider = { credential: unavailable };
