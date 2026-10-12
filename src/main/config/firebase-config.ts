import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  oauthClientId: string;
  oauthClientSecret: string;
}

function loadFirebaseConfig(): FirebaseAppConfig {
  const candidatePaths: string[] = [
    process.env.FIREBASE_CONFIG_PATH || '',
    path.join(process.cwd(), 'firebase.json'),
  ];

  try {
    if (app && typeof app.getAppPath === 'function') {
      candidatePaths.push(path.join(app.getAppPath(), 'firebase.json'));
    }
  } catch (_) {}

  try {
    if (app && typeof app.getPath === 'function') {
      candidatePaths.push(path.join(app.getPath('userData'), 'firebase.json'));
    }
  } catch (_) {}

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.projectId) {
          return {
            apiKey: parsed.apiKey || '',
            authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
            projectId: parsed.projectId,
            storageBucket: parsed.storageBucket || `${parsed.projectId}.firebasestorage.app`,
            messagingSenderId: parsed.messagingSenderId || '',
            appId: parsed.appId || '',
            oauthClientId: parsed.oauthClientId || '',
            oauthClientSecret: parsed.oauthClientSecret || '',
          };
        }
      } catch (err) {
        console.warn(`[FirebaseConfig] Error reading config from ${p}:`, err);
      }
    }
  }

  // Environment variable fallback
  return {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || 'akki-ai-15b8b',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    oauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    oauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  };
}

export const FIREBASE_CONFIG: FirebaseAppConfig = loadFirebaseConfig();
