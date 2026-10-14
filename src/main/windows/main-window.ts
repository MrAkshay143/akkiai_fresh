import { BrowserWindow, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { whatsAppManager } from '../services/whatsapp/whatsapp-manager';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }

  // Resolve application icon
  const iconCandidates = [
    path.join(app.getAppPath(), 'resources', 'branding', 'logo.png'),
    path.join(__dirname, '..', '..', '..', 'resources', 'branding', 'logo.png'),
    path.join(process.cwd(), 'resources', 'branding', 'logo.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  // Resolve preload script
  const preloadCandidates = [
    path.join(__dirname, '..', '..', 'preload', 'index.js'),
    path.join(__dirname, '..', 'preload', 'index.js'),
    path.join(app.getAppPath(), 'dist-electron', 'preload', 'index.js'),
    path.join(process.cwd(), 'dist-electron', 'preload', 'index.js'),
  ];
  const preloadPath = preloadCandidates.find((p) => fs.existsSync(p)) || preloadCandidates[0];

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#07090c',
      symbolColor: '#ffffff',
      height: 44,
    },
    backgroundColor: '#07090c',
    show: false,
    title: 'Akki AI — Desktop Companion',
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
    },
  });

  whatsAppManager.setMainWindow(mainWindow);

  // Graceful show on ready-to-show
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Fallback timer to guarantee window visibility
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1000);

  // External link and popup security policies
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Prevent navigation away from the local app origin
    const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (isDev && url.startsWith(devUrl)) {
      return;
    }
    if (url.startsWith('file://')) {
      return;
    }
    event.preventDefault();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  // Load URL or local index.html
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const prodCandidates = [
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(__dirname, '..', '..', 'renderer', 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
    ];
    const prodFile = prodCandidates.find((p) => fs.existsSync(p)) || prodCandidates[0];
    mainWindow.loadFile(prodFile).catch((err) => {
      console.error('[MainWindow] Failed to load index.html:', err);
    });
  }

  mainWindow.on('closed', () => {
    whatsAppManager.setMainWindow(null);
    mainWindow = null;
  });

  return mainWindow;
}

export function minimizeMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
}

export function toggleMaximizeMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
}

export function closeMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
}
