/**
 * macOS Custom Auto-Updater (ported from reference electron/services/macos-updater.js)
 */

import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PREFIX = '[macOS Updater]';
const DEFAULT_FEED_URL = 'https://imakshay.in/akkiai/update';
const CHANNEL_FILE = 'latest-mac.yml';

const log = {
  info: (...a: any[]) => console.log(PREFIX, ...a),
  warn: (...a: any[]) => console.warn(PREFIX, ...a),
  error: (...a: any[]) => console.error(PREFIX, ...a),
};

export interface ChannelInfo {
  version: string;
  zipUrl: string;
  zipSha: string;
  zipSize: number;
}

interface UpdaterState {
  autoDownload: boolean;
  checking: boolean;
  downloading: boolean;
  pending: { version: string; appPath: string; workDir: string } | null;
  lastInfo?: { info: ChannelInfo; feed: string };
  sendStatus: (data: any) => void;
}

const state: UpdaterState = {
  autoDownload: true,
  checking: false,
  downloading: false,
  pending: null,
  sendStatus: () => {},
};

function getFeedUrl(): string {
  try {
    const cfgPath = path.join((process as any).resourcesPath || '', 'app-update.yml');
    if (fs.existsSync(cfgPath)) {
      const m = fs.readFileSync(cfgPath, 'utf8').match(/^url:\s*(\S+)/m);
      if (m) return m[1].replace(/['"]/g, '').replace(/\/+$/, '');
    }
  } catch { /* fall through */ }
  return DEFAULT_FEED_URL;
}

function httpGet(url: string, { asStream = false, redirects = 5 }: { asStream?: boolean; redirects?: number } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return httpGet(next, { asStream, redirects: redirects - 1 }).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      if (asStream) return resolve(res);
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Request timeout')));
  });
}

export function parseChannelYml(text: string): ChannelInfo {
  const version = (text.match(/^version:\s*(.+)$/m) || [])[1];
  if (!version) throw new Error('latest-mac.yml: version missing');

  let zipUrl = '';
  let zipSha = '';
  let zipSize = 0;
  const entryRe = /-\s+url:\s*(.+)\s*\n\s+sha512:\s*(\S+)\s*\n(?:\s+size:\s*(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(text)) !== null) {
    if (m[1].trim().endsWith('.zip')) {
      zipUrl = m[1].trim();
      zipSha = m[2].trim();
      zipSize = parseInt(m[3] || '0', 10);
      break;
    }
  }
  if (!zipUrl) {
    const p = (text.match(/^path:\s*(.+)$/m) || [])[1];
    const s = (text.match(/^sha512:\s*(\S+)$/m) || [])[1];
    if (p && p.trim().endsWith('.zip')) { zipUrl = p.trim(); zipSha = (s || '').trim(); }
  }
  if (!zipUrl) throw new Error('latest-mac.yml: no .zip entry found');
  return { version: version.trim(), zipUrl, zipSha, zipSize };
}

export function isNewerVersion(remote: string, local: string): boolean {
  const pa = String(remote).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(local).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] || 0, b = pb[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function execFileP(cmd: string, args: string[], opts: any = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 300000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve(stdout ? stdout.toString() : '');
    });
  });
}

function getCurrentAppBundlePath(): string | null {
  const exe = process.execPath;
  const idx = exe.indexOf('.app/Contents/');
  if (idx === -1) return null;
  return exe.slice(0, idx + 4);
}

export async function checkForUpdates(): Promise<void> {
  if (state.checking || state.downloading) return;
  state.checking = true;
  state.sendStatus({ status: 'checking' });
  try {
    const feed = getFeedUrl();
    const yml = await httpGet(`${feed}/${CHANNEL_FILE}`);
    const info = parseChannelYml(yml);
    const current = app.getVersion();

    if (!isNewerVersion(info.version, current)) {
      log.info(`Up to date (local ${current}, remote ${info.version}).`);
      state.sendStatus({ status: 'not-available' });
      return;
    }

    log.info(`Update available: ${current} → ${info.version}`);
    state.sendStatus({ status: 'available', version: info.version });

    if (state.autoDownload) {
      await downloadUpdate(info, feed);
    } else {
      state.lastInfo = { info, feed };
    }
  } catch (err: any) {
    log.error('Check failed:', err.message);
    state.sendStatus({ status: 'error', message: err.message });
  } finally {
    state.checking = false;
  }
}

export async function downloadUpdate(info?: ChannelInfo, feed?: string): Promise<any> {
  if (state.downloading) return;
  if (!info && state.lastInfo) ({ info, feed } = state.lastInfo);
  if (!info) throw new Error('No update info — call check first');
  state.downloading = true;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akki-update-'));
  const zipPath = path.join(workDir, 'update.zip');

  try {
    const url = `${feed}/${encodeURIComponent(info.zipUrl)}`;
    log.info(`Downloading ${url}`);
    const res = await httpGet(url, { asStream: true });
    const total = parseInt(res.headers['content-length'] || '0', 10) || info.zipSize || 0;
    const hash = crypto.createHash('sha512');
    const out = fs.createWriteStream(zipPath);

    let transferred = 0;
    let lastTick = Date.now();
    let lastBytes = 0;
    await new Promise((resolve, reject) => {
      res.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        transferred += chunk.length;
        const now = Date.now();
        if (now - lastTick >= 500) {
          const bytesPerSecond = Math.round(((transferred - lastBytes) / (now - lastTick)) * 1000);
          state.sendStatus({
            status: 'downloading',
            percent: total ? Math.round((transferred / total) * 100) : 0,
            bytesPerSecond,
            transferred,
            total,
          });
          lastTick = now;
          lastBytes = transferred;
        }
      });
      res.pipe(out);
      out.on('finish', () => resolve(true));
      out.on('error', reject);
      res.on('error', reject);
    });

    if (info.zipSha) {
      const digest = hash.digest('base64');
      if (digest !== info.zipSha) {
        throw new Error('SHA512 mismatch — corrupted or tampered download, refusing to install.');
      }
      log.info('SHA512 verified.');
    } else {
      log.warn('No sha512 in channel file — skipping integrity check.');
    }

    const extractDir = path.join(workDir, 'extracted');
    fs.mkdirSync(extractDir);
    await execFileP('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
    const appName = fs.readdirSync(extractDir).find((e) => e.endsWith('.app'));
    if (!appName) throw new Error('No .app bundle inside the update zip');
    const newAppPath = path.join(extractDir, appName);

    try { await execFileP('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newAppPath]); } catch { /* ignore */ }

    state.pending = { version: info.version, appPath: newAppPath, workDir };
    log.info(`Update ${info.version} downloaded & extracted, ready to install.`);
    state.sendStatus({ status: 'downloaded', version: info.version });
    return true;
  } catch (err: any) {
    fs.rmSync(workDir, { recursive: true, force: true });
    log.error('Download failed:', err.message);
    state.sendStatus({ status: 'error', message: err.message });
    throw err;
  } finally {
    state.downloading = false;
  }
}

export async function quitAndInstall(): Promise<void> {
  const pending = state.pending;
  if (!pending) {
    log.warn('install requested but no update is downloaded.');
    return;
  }

  const currentApp = getCurrentAppBundlePath();
  if (!currentApp) {
    state.sendStatus({ status: 'error', message: 'Not running from a .app bundle — cannot self-update.' });
    return;
  }
  if (currentApp.includes('/AppTranslocation/')) {
    dialog.showMessageBoxSync({
      type: 'info',
      message: 'Please move Akki Ai to the Applications folder first, then update again.',
    });
    return;
  }

  const backupPath = path.join(os.tmpdir(), `akki-old-${Date.now()}.app`);
  try {
    log.info(`Installing ${pending.version}: swapping ${currentApp}`);
    await execFileP('/bin/mv', [currentApp, backupPath]);
    try {
      await execFileP('/bin/mv', [pending.appPath, currentApp]);
    } catch (err) {
      await execFileP('/bin/mv', [backupPath, currentApp]).catch(() => {});
      throw err;
    }
    fs.rmSync(backupPath, { recursive: true, force: true });
    fs.rmSync(pending.workDir, { recursive: true, force: true });

    log.info('Swap complete — restarting into the new version.');
    const reopen = spawn('/bin/sh', ['-c', `sleep 2; /usr/bin/open -n "${currentApp.replace(/"/g, '\\"')}"`], {
      detached: true,
      stdio: 'ignore',
    });
    reopen.unref();
    state.pending = null;
    app.exit(0);
  } catch (err: any) {
    log.error('Install failed:', err.message);
    state.sendStatus({ status: 'error', message: `Install failed: ${err.message}` });
  }
}

export function setupMacUpdater({ getMainWindow, autoDownload }: { getMainWindow: () => BrowserWindow | null; autoDownload?: boolean }): void {
  state.autoDownload = !!autoDownload;
  state.sendStatus = (data: any) => {
    try {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send('update-status', data);
    } catch { /* window gone */ }
  };

  setTimeout(() => checkForUpdates(), 5000);
  log.info(`Enabled (feed: ${getFeedUrl()}, autoDownload: ${state.autoDownload}).`);
}

export function setMacAutoDownload(enabled: boolean): void {
  state.autoDownload = !!enabled;
}

export function macDownloadUpdate(): Promise<any> {
  return downloadUpdate();
}
