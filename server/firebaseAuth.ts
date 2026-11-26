import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

interface FirebaseAppletConfig {
  projectId?: string;
}

function loadFirebaseProjectId(): string | null {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseAppletConfig;
    const projectId = (parsed.projectId || '').trim();
    if (!projectId || projectId === 'remixed-project-id') return null;
    return projectId;
  } catch {
    return null;
  }
}

function getFirebaseAdminApp(): App | null {
  const projectId = loadFirebaseProjectId();
  if (!projectId) return null;
  return getApps().length ? getApp() : initializeApp({ projectId });
}

export function isFirebaseAuthConfigured(): boolean {
  return loadFirebaseProjectId() !== null;
}

export async function verifyGoogleFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error('Google Sign-In is not configured on this server.');
  }
  const decoded = await getAuth(app).verifyIdToken(idToken);
  if (!decoded.email || decoded.email_verified === false) {
    throw new Error('A verified Google email address is required.');
  }
  return decoded;
}
