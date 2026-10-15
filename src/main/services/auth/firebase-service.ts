import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, signOut, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { OAuth2Client } from 'google-auth-library';
import { FIREBASE_CONFIG } from '../../config/firebase-config';
import { authCredentialStore } from './auth-credential-store';

class FirebaseService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private oauthClient: OAuth2Client;

  constructor() {
    this.oauthClient = new OAuth2Client(
      FIREBASE_CONFIG.oauthClientId,
      FIREBASE_CONFIG.oauthClientSecret,
      'http://localhost:53921/callback'
    );
  }

  initFirebase() {
    if (!getApps().length) {
      this.app = initializeApp(FIREBASE_CONFIG);
    } else {
      this.app = getApps()[0];
    }
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
  }

  shutdownFirebase() {
    // optional shutdown logic
  }

  getOAuthConfig() {
    return {
      clientId: FIREBASE_CONFIG.oauthClientId,
      redirectUri: 'http://localhost:53921/callback',
      authUrl: this.oauthClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['profile', 'email']
      })
    };
  }

  async exchangeGoogleCode(code: string): Promise<any> {
    try {
      if (!this.auth) this.initFirebase();
      
      const { tokens } = await this.oauthClient.getToken(code);
      this.oauthClient.setCredentials(tokens);
      
      const idToken = tokens.id_token;
      if (!idToken) throw new Error('No id_token received');
      
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(this.auth!, credential);
      
      // Save session
      authCredentialStore.saveCredential(JSON.stringify(tokens));

      return {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
      };
    } catch (err) {
      console.error('[FirebaseService] Code exchange failed:', err);
      throw err;
    }
  }

  async getStoredSession(): Promise<any> {
    try {
      const tokenDataStr = authCredentialStore.loadCredential();
      if (!tokenDataStr) return { authenticated: false };

      const tokens = JSON.parse(tokenDataStr);
      if (!tokens.id_token) return { authenticated: false };

      if (!this.auth) this.initFirebase();

      const credential = GoogleAuthProvider.credential(tokens.id_token);
      const userCredential = await signInWithCredential(this.auth!, credential);
      
      return {
        authenticated: true,
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName,
        }
      };
    } catch {
      try {
        const sessionPath = path.join(app.getPath('userData'), 'firebase_session.json');
        if (fs.existsSync(sessionPath)) {
          const cached = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
          if (cached && (cached.email || cached.uid)) {
            console.log('[FirebaseService] Restored persistent session for:', cached.email || cached.displayName || 'Authorized User');
            return {
              authenticated: true,
              user: cached,
            };
          }
        }
      } catch (_) {}
      return { authenticated: false };
    }
  }

  isAuthenticated(): boolean {
    return !!this.auth?.currentUser;
  }

  getCurrentUser(): { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null } | null {
    if (this.auth?.currentUser) {
      return {
        uid: this.auth.currentUser.uid,
        email: this.auth.currentUser.email,
        displayName: this.auth.currentUser.displayName,
        photoURL: this.auth.currentUser.photoURL,
      };
    }
    try {
      const sessionPath = path.join(app.getPath('userData'), 'firebase_session.json');
      if (fs.existsSync(sessionPath)) {
        const cached = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        if (cached && (cached.email || cached.uid)) {
          return cached;
        }
      }
    } catch (_) {}
    return null;
  }

  async signOutUser(): Promise<void> {
    if (this.auth) {
      await signOut(this.auth);
    }
    authCredentialStore.deleteCredential();
  }
}

export const firebaseService = new FirebaseService();
