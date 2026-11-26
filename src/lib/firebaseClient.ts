import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

function getClientFirebaseApp(): FirebaseApp | null {
  const projectId = (firebaseConfig?.projectId || '').trim();
  if (!projectId || projectId === 'remixed-project-id') {
    return null;
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export async function signInHouseholdWithGoogle(): Promise<string> {
  const app = getClientFirebaseApp();
  if (!app) {
    throw new Error('Google Sign-In is not configured yet.');
  }
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  if (!idToken) {
    throw new Error('Could not obtain a verified Google sign-in token.');
  }
  return idToken;
}

export async function signOutFirebaseClient(): Promise<void> {
  const app = getClientFirebaseApp();
  if (!app) return;
  try {
    await signOut(getAuth(app));
  } catch {
    // ignore sign-out errors if no active Firebase session
  }
}
