/**
 * Auto-Updater Service
 * Mirrors REFERENCE electron/main_source.js lines 4218-4351
 */

import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { setupMacUpdater, setMacAutoDownload, macDownloadUpdate, quitAndInstall as macQuitAndInstall, checkForUpdates as macCheckForUpdates } from './macos-updater';

export const UPDATES_ENABLED = true;

function getUserDataPath(fileName: string): string {
  return path.join(app.getPath('userData'), fileName);
}

export function getAutoUpdateEnabled(): boolean {
  try {
    const p = getUserDataPath('auto_update_settings.json');
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      return d?.enabled !== false;
    }
  } catch {}
  return true;
}

export function setAutoUpdateEnabled(enabled: boolean): boolean {
  try {
    const p = getUserDataPath('auto_update_settings.json');
    fs.writeFileSync(p, JSON.stringify({ enabled, updatedAt: Date.now() }, null, 2), 'utf8');

    if (process.env.NODE_ENV !== 'development') {
      if (process.platform === 'darwin') {
        setMacAutoDownload(enabled);
      } else {
        autoUpdater.autoDownload = enabled;
      }
    }
    return true;
  } catch {
    return false;
  }
}

let updaterInitialized = false;

export function setupAutoUpdater({ getMainWindow }: { getMainWindow: () => BrowserWindow | null }): void {
  if (updaterInitialized) return;
  updaterInitialized = true;

  if (process.env.NODE_ENV === 'development') {
    console.log('[Akki Updater] Running in development mode — auto-update background checks disabled.');
    return;
  }

  // macOS path
  if (process.platform === 'darwin') {
    if (!UPDATES_ENABLED) return;
    setupMacUpdater({
      getMainWindow,
      autoDownload: getAutoUpdateEnabled(),
    });
    return;
  }

  // Windows / Linux path via electron-updater
  try {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://imakshay.in/akkiai/update',
    });

    autoUpdater.autoDownload = getAutoUpdateEnabled();
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;

    const sendStatus = (data: any) => {
      try {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-status', data);
        }
      } catch (e) {}
    };

    autoUpdater.on('checking-for-update', () => {
      console.log('[Akki Updater] Checking for update...');
      sendStatus({ status: 'checking' });
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Akki Updater] Update not available. Current version is latest.');
      sendStatus({ status: 'not-available' });
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[Akki Updater] Update available: v${info.version}. Auto-downloading...`);
      sendStatus({ status: 'available', version: info.version });
      if (getAutoUpdateEnabled()) {
        autoUpdater.downloadUpdate().catch((err) => {
          console.error('[Akki Updater] downloadUpdate invocation failed:', err);
        });
      }
    });

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent);
      console.log(
        `[Akki Updater] Download progress: ${pct}% | ${Math.round(progress.bytesPerSecond / 1024)} KB/s`
      );
      sendStatus({
        status: 'downloading',
        percent: pct,
        bytesPerSecond: Math.round(progress.bytesPerSecond),
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[Akki Updater] Update downloaded successfully: v${info.version}`);
      sendStatus({ status: 'downloaded', version: info.version });
    });

    autoUpdater.on('error', (err) => {
      console.error('[Akki Updater] Error:', err ? err.message : err);
      sendStatus({
        status: 'error',
        message: err ? err.message : 'Update error',
      });
    });

    if (UPDATES_ENABLED) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 5000);
    }
  } catch (err: any) {
    console.error('[Akki Updater] Setup error:', err.message);
  }
}

export async function checkForUpdates(getMainWindow: () => BrowserWindow | null): Promise<any> {
  if (!UPDATES_ENABLED) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { status: 'error', message: 'Updates are disabled in this version.' });
    }
    return { disabled: true };
  }
  if (process.platform === 'darwin') {
    return macCheckForUpdates();
  }
  return autoUpdater.checkForUpdates().catch((err) => {
    console.warn('[Akki Updater] checkForUpdates error:', err?.message);
  });
}

export async function downloadUpdate(): Promise<any> {
  if (!UPDATES_ENABLED) {
    console.log('[Akki] download-update ignored: updates are disabled in this version.');
    return { disabled: true };
  }
  if (process.env.NODE_ENV === 'development') {
    console.log('[Akki Dev] download-update invoked in development mode.');
    return null;
  }
  if (process.platform === 'darwin') {
    return macDownloadUpdate();
  }
  return autoUpdater.downloadUpdate();
}

export function installUpdate(getMainWindow: () => BrowserWindow | null): any {
  if (!UPDATES_ENABLED) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-status', { status: 'error', message: 'Updates are disabled in this version.' });
    }
    return { disabled: true };
  }
  if (process.platform === 'darwin') {
    return macQuitAndInstall();
  }
  autoUpdater.quitAndInstall(false, true);
  return true;
}
