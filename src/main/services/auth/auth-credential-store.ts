import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

const CREDENTIAL_FILE = 'firebase_credential.bin';

export class AuthCredentialStore {
  private getFilePath(): string {
    return path.join(app.getPath('userData'), CREDENTIAL_FILE);
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  saveCredential(token: string): boolean {
    try {
      const buffer = this.isEncryptionAvailable()
        ? safeStorage.encryptString(token)
        : Buffer.from(token, 'utf-8');
      fs.writeFileSync(this.getFilePath(), buffer);
      return true;
    } catch (error) {
      console.error('[AuthCredentialStore] Failed to save credential:', error);
      return false;
    }
  }

  loadCredential(): string | null {
    try {
      const filePath = this.getFilePath();
      if (!fs.existsSync(filePath)) return null;

      const buffer = fs.readFileSync(filePath);
      return this.isEncryptionAvailable()
        ? safeStorage.decryptString(buffer)
        : buffer.toString('utf-8');
    } catch (error) {
      console.error('[AuthCredentialStore] Failed to load credential:', error);
      return null;
    }
  }

  deleteCredential(): boolean {
    try {
      const filePath = this.getFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (error) {
      console.error('[AuthCredentialStore] Failed to delete credential:', error);
      return false;
    }
  }
}

export const authCredentialStore = new AuthCredentialStore();
