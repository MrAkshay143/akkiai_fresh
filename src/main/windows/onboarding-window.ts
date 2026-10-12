import { BrowserWindow, app, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { getMainWindow, createMainWindow } from './main-window';

let onboardingWindow: BrowserWindow | null = null;
let reauthMode = false;
let pwaWindow: BrowserWindow | null = null;
let licenseWindow: BrowserWindow | null = null;

export function resolveElectronHtmlPath(subpath: string): string {
  const candidates = [
    path.join(app.getAppPath(), 'electron', subpath),
    path.join(__dirname, '..', '..', 'electron', subpath),
    path.join(__dirname, '..', 'electron', subpath),
    path.join(process.cwd(), 'electron', subpath),
    path.join(process.resourcesPath, 'electron', subpath),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function resolveAppIcon(): Electron.NativeImage | undefined {
  const iconCandidates = [
    path.join(app.getAppPath(), 'resources', 'branding', 'logo.png'),
    path.join(__dirname, '..', '..', '..', 'resources', 'branding', 'logo.png'),
    path.join(process.cwd(), 'resources', 'branding', 'logo.png'),
    path.join(process.resourcesPath, 'branding', 'logo.png'),
  ];
  const p = iconCandidates.find((ip) => fs.existsSync(ip));
  return p ? nativeImage.createFromPath(p) : undefined;
}

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow;
}

export function getReauthMode(): boolean {
  return reauthMode;
}

export function setReauthMode(mode: boolean): void {
  reauthMode = mode;
}

export function createOnboardingWindow(mode?: string): BrowserWindow {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    if (onboardingWindow.isMinimized()) onboardingWindow.restore();
    onboardingWindow.focus();
    return onboardingWindow;
  }

  reauthMode = mode === 'reauth';

  const indexPath = resolveElectronHtmlPath(path.join('onboarding', 'index.html'));
  const preloadPath = resolveElectronHtmlPath(path.join('onboarding', 'preload.js'));
  const icon = resolveAppIcon();

  onboardingWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    resizable: true,
    show: false,
    transparent: false,
    backgroundColor: '#050505',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#ffffff',
      height: 44,
    },
    title: 'AKKI AI — System Onboarding',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  onboardingWindow.loadFile(indexPath);

  const showFallback = setTimeout(() => {
    if (
      onboardingWindow &&
      !onboardingWindow.isDestroyed() &&
      !onboardingWindow.isVisible()
    ) {
      console.log('[Akki Onboarding] Force-showing after 3s timeout');
      onboardingWindow.show();
      onboardingWindow.focus();
    }
  }, 3000);

  onboardingWindow.once('ready-to-show', () => {
    clearTimeout(showFallback);
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.maximize();
      onboardingWindow.show();
      onboardingWindow.focus();
    }
  });

  onboardingWindow.webContents.on('render-process-gone', () => {
    console.error('[Akki Onboarding] Renderer crashed or process gone!');
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.show();
      onboardingWindow.focus();
    }
  });

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });

  return onboardingWindow;
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close();
    onboardingWindow = null;
  }
}

export function createLicenseWindow(): BrowserWindow {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    if (licenseWindow.isMinimized()) licenseWindow.restore();
    licenseWindow.focus();
    return licenseWindow;
  }

  const indexPath = resolveElectronHtmlPath(path.join('license', 'index.html'));
  const preloadPath = resolveElectronHtmlPath(path.join('license', 'preload.js'));
  const icon = resolveAppIcon();

  licenseWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    show: false,
    backgroundColor: '#050505',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#ffffff',
      height: 44,
    },
    title: 'AKKI AI — License & Authorization',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  licenseWindow.loadFile(indexPath);
  licenseWindow.once('ready-to-show', () => {
    licenseWindow?.show();
    licenseWindow?.focus();
  });
  licenseWindow.on('closed', () => {
    licenseWindow = null;
  });

  return licenseWindow;
}

export function closeLicenseWindow(): void {
  if (licenseWindow && !licenseWindow.isDestroyed()) {
    licenseWindow.close();
    licenseWindow = null;
  }
}

export function createPwaWindow(): BrowserWindow {
  if (pwaWindow && !pwaWindow.isDestroyed()) {
    if (pwaWindow.isMinimized()) pwaWindow.restore();
    pwaWindow.focus();
    return pwaWindow;
  }

  const indexPath = resolveElectronHtmlPath(path.join('pwa', 'index.html'));
  const icon = resolveAppIcon();

  pwaWindow = new BrowserWindow({
    width: 440,
    height: 820,
    minWidth: 380,
    minHeight: 640,
    resizable: true,
    show: false,
    backgroundColor: '#0a0d14',
    title: 'AKKI AI — Mobile PWA Companion',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  pwaWindow.loadFile(indexPath);
  pwaWindow.once('ready-to-show', () => {
    pwaWindow?.show();
    pwaWindow?.focus();
  });
  pwaWindow.on('closed', () => {
    pwaWindow = null;
  });

  return pwaWindow;
}

export function closePwaWindow(): void {
  if (pwaWindow && !pwaWindow.isDestroyed()) {
    pwaWindow.close();
    pwaWindow = null;
  }
}

export function showLicenseBlocked(): void {
  dialog
    .showMessageBox({
      type: 'error',
      title: 'Authorization Revoked',
      message: 'Your Akki Ai access has been suspended or blocked by the administrator.',
      detail: 'Please contact the administrator to re-enable authorization for this device.',
      buttons: ['OK'],
    })
    .then(() => {
      app.quit();
    });
}
