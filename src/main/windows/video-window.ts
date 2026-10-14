import { BrowserWindow, app, shell, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { getMainWindow } from './main-window';

const videoWindows = new Set<BrowserWindow>();

export function getVideoWindows(): Set<BrowserWindow> {
  return videoWindows;
}

export function closeAllVideoWindows(): void {
  videoWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  videoWindows.clear();
}

export function createVideoWindow(videoId: string): BrowserWindow {
  // Parity with old app: Close existing video windows before opening a new one
  closeAllVideoWindows();

  const iconCandidates = [
    path.join(app.getAppPath(), 'resources', 'branding', 'logo.png'),
    path.join(__dirname, '..', '..', '..', 'resources', 'branding', 'logo.png'),
    path.join(process.cwd(), 'resources', 'branding', 'logo.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  const preloadCandidates = [
    path.join(__dirname, '..', '..', 'preload', 'index.js'),
    path.join(__dirname, '..', 'preload', 'index.js'),
    path.join(app.getAppPath(), 'dist-electron', 'preload', 'index.js'),
    path.join(process.cwd(), 'dist-electron', 'preload', 'index.js'),
  ];
  const preloadPath = preloadCandidates.find((p) => fs.existsSync(p)) || preloadCandidates[0];

  const videoWin = new BrowserWindow({
    width: 800,
    height: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#0B141B',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: false,
      devTools: false,
    },
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
  });

  videoWindows.add(videoWin);

  const searchParam = `videoId=${encodeURIComponent(videoId)}&mode=player`;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    const url = devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`;
    videoWin.loadURL(`${url}?${searchParam}`);
  } else {
    const prodCandidates = [
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(__dirname, '..', '..', 'renderer', 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
    ];
    const prodFile = prodCandidates.find((p) => fs.existsSync(p)) || prodCandidates[0];
    videoWin.loadFile(prodFile, { search: searchParam }).catch((err) => {
      console.error('[VideoWindow] Failed to load index.html:', err);
    });
  }

  videoWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  videoWin.on('closed', () => {
    videoWindows.delete(videoWin);
  });

  return videoWin;
}

export function controlVideoWindows(action: string, value?: unknown): boolean {
  let success = false;

  videoWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      if (action === 'minimize') {
        win.minimize();
        success = true;
      } else if (action === 'maximize') {
        if (win.isMinimized()) win.restore();
        else if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        success = true;
      } else if (action === 'restore') {
        if (win.isMinimized()) win.restore();
        else if (win.isMaximized()) win.unmaximize();
        else win.show();
        success = true;
      } else if (action === 'fullscreen') {
        win.setFullScreen(!win.isFullScreen());
        success = true;
      } else if (action === 'close') {
        win.close();
        success = true;
      } else {
        // Playback, seeking, and player volume commands
        win.webContents.send('media-player-control', { action, value });
        success = true;
      }
    }
  });

  // Also broadcast to main window in case player is open as overlay
  const mainWin = getMainWindow();
  if (mainWin && !mainWin.isDestroyed()) {
    if (action === 'close') {
      mainWin.webContents.send('close-media-player');
      success = true;
    } else {
      mainWin.webContents.send('media-player-control', { action, value });
      success = true;
    }
  }

  return success;
}
