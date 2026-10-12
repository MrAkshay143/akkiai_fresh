/**
 * Agent Town Server Manager
 *
 * Starts the Agent Town Next.js server as a child process from Electron.
 * The server runs on localhost:3000 and provides the full Agent Town UI
 * which is then embedded in Akki Ai via an iframe.
 *
 * Parity aligned with test_unpack/electron/services/agent-town-server.js
 */

import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { app } from 'electron';
import { getActualBridgePort } from './hermes-bridge-service';

// ── File-based logging for production debugging ──────────────────
const LOG_DIR = app && typeof app.getPath === 'function' ? path.join(app.getPath('userData'), 'logs') : __dirname;
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // ignore
}
const LOG_FILE = path.join(LOG_DIR, 'agent-town-server.log');

function writeLog(level: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const line = `[${timestamp}] [${level}] ${msg}\n`;
  if (level === 'ERROR') console.error('[Agent Town Server]', ...args);
  else console.log('[Agent Town Server]', ...args);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore
  }
}

const log = {
  info: (...args: unknown[]) => writeLog('INFO', ...args),
  warn: (...args: unknown[]) => writeLog('WARN', ...args),
  error: (...args: unknown[]) => writeLog('ERROR', ...args),
};

let serverProcess: ChildProcess | null = null;
let isReady = false;
let serverPort = 3000;

/**
 * Kill any stale process currently occupying the port (Windows: netstat + taskkill).
 */
async function killProcessOnPort(port: number): Promise<void> {
  if (process.platform !== 'win32') {
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        exec(`lsof -ti tcp:${port}`, { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
          if (err) return reject(err);
          resolve(stdout || '');
        });
      });
      for (const pid of stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
        if (pid === String(process.pid)) continue;
        try {
          process.kill(Number(pid), 'SIGKILL');
          log.info(`Killed stale process PID ${pid} on port ${port}`);
        } catch {
          // already dead
        }
      }
    } catch {
      // port was not in use
    }
    return;
  }

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      exec(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout || '');
      });
    });
    const pids = new Set<string>();
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== String(process.pid)) {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      log.info(`Port ${port} in use by PID ${pid} — terminating stale process`);
      try {
        exec(`taskkill /pid ${pid} /f /t`, { windowsHide: true }, () => {});
      } catch {
        // ignore
      }
    }
    if (pids.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  } catch {
    // port was not in use
  }
}

/**
 * Remove all known Next.js lockfile paths so the new process can start cleanly.
 */
function clearNextLockFiles(agentTownPath: string): void {
  const lockPaths = [
    path.join(agentTownPath, '.next', 'dev', 'lock'),
    path.join(agentTownPath, '.next', 'lockfile'),
    path.join(agentTownPath, '.next', 'cache', 'lockfile'),
    path.join(agentTownPath, '.next', 'trace'),
  ];
  for (const p of lockPaths) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        log.info(`Removed stale lock: ${path.relative(agentTownPath, p)}`);
      } catch (e: any) {
        log.warn(`Could not remove lock ${p}: ${e.message}`);
      }
    }
  }
}

/**
 * Resolve the Agent Town project directory.
 */
export function getAgentTownPath(): string | null {
  // 1. Env var
  const envPath = process.env.AGENT_TOWN_PATH;
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);

  // 2. Production: bundled in extraResources
  if (process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, 'agent-town');
    if (fs.existsSync(path.join(resourcePath, 'package.json'))) return resourcePath;
  }

  // 3. Local workspace resources/agent-town
  const localResources = path.resolve(process.cwd(), 'resources', 'agent-town');
  if (fs.existsSync(path.join(localResources, 'server.js'))) {
    return localResources;
  }

  // 4. Fallback via app.getAppPath()
  try {
    if (app && typeof app.getAppPath === 'function') {
      const appPath = path.join(app.getAppPath(), 'resources', 'agent-town');
      if (fs.existsSync(path.join(appPath, 'server.js'))) {
        return appPath;
      }
      const parentAppPath = path.join(app.getAppPath(), '..', 'resources', 'agent-town');
      if (fs.existsSync(path.join(parentAppPath, 'server.js'))) {
        return parentAppPath;
      }
    }
  } catch {
    // ignore
  }

  // 5. Development layout sibling or nested
  const devPath = path.resolve(__dirname, '..', '..', '..', 'agent-town-main', 'agent-town-main');
  if (fs.existsSync(path.join(devPath, 'package.json'))) return devPath;

  const akkiDevPath = path.resolve(__dirname, '..', '..', 'agent-town');
  if (fs.existsSync(path.join(akkiDevPath, 'package.json'))) return akkiDevPath;

  // 6. Installed Akki Ai fallback
  try {
    const installedPath = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Programs',
      'akki_ai',
      'resources',
      'agent-town'
    );
    if (fs.existsSync(path.join(installedPath, 'server.js'))) {
      return installedPath;
    }
  } catch {}

  return null;
}

/**
 * Resolve Hermes project path for Agent Town's bridge.
 */
function getHermesPath(): string | null {
  const envPath = process.env.HERMES_PROJECT_PATH;
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);

  const devPath = path.resolve(__dirname, '..', '..', '..', 'hermes-agent-main');
  if (fs.existsSync(devPath)) return devPath;

  const akkiDevPath = path.resolve(__dirname, '..', '..', 'hermes-agent');
  if (fs.existsSync(akkiDevPath)) return akkiDevPath;

  return null;
}

/**
 * Mirror user's provider key into ~/.hermes/.env so stale key doesn't override.
 */
function syncHermesDotEnvKey(): void {
  try {
    if (!app || typeof app.getPath !== 'function') return;
    const configPath = path.join(app.getPath('userData'), 'agent_town_config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const updates: Record<string, string> = {};
    if (config.provider === 'openai-codex') return;
    if (config.provider === 'openrouter') {
      const k = config.openRouterApiKey || config.apiKey;
      if (k) updates.OPENROUTER_API_KEY = k;
    } else {
      const k = config.geminiApiKey || config.apiKey;
      if (k) {
        updates.GOOGLE_API_KEY = k;
        updates.GEMINI_API_KEY = k;
      }
    }
    if (Object.keys(updates).length === 0) return;

    const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
    const envPath = path.join(hermesHome, '.env');
    let lines: string[] = [];
    if (fs.existsSync(envPath)) lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

    let changed = false;
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([A-Za-z0-9_]+)\s*=/);
      if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
        seen.add(m[1]);
        const desired = `${m[1]}=${updates[m[1]]}`;
        if (lines[i] !== desired) {
          lines[i] = desired;
          changed = true;
        }
      }
    }
    for (const key of Object.keys(updates)) {
      if (seen.has(key)) continue;
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push(`${key}=${updates[key]}`);
      changed = true;
    }
    if (!changed) return;

    if (!fs.existsSync(hermesHome)) fs.mkdirSync(hermesHome, { recursive: true });
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
    log.info(`Synced current ${config.provider} API key into ${envPath}`);
  } catch (err: any) {
    log.warn(`syncHermesDotEnvKey failed: ${err.message}`);
  }
}

function getProviderApiKeyEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    if (!app || typeof app.getPath !== 'function') return env;
    syncHermesDotEnvKey();
    const configPath = path.join(app.getPath('userData'), 'agent_town_config.json');
    if (!fs.existsSync(configPath)) return env;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (config.provider) env.HERMES_INFERENCE_PROVIDER = config.provider;
    if (config.provider === 'openai-codex') return env;

    const activeKey =
      config.provider === 'openrouter'
        ? config.openRouterApiKey || config.apiKey
        : config.geminiApiKey || config.apiKey;

    if (!activeKey) return env;
    if (config.provider === 'openrouter') {
      env.OPENROUTER_API_KEY = activeKey;
    } else {
      env.GOOGLE_API_KEY = activeKey;
      env.GEMINI_API_KEY = activeKey;
    }
  } catch (err: any) {
    log.warn(`Could not read provider API key from agent_town_config.json: ${err.message}`);
  }
  return env;
}

/**
 * Check if the server is ready by pinging it with guard flag against double-fire.
 */
function waitForReady(port: number, maxAttempts = 90, intervalMs = 1000): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let settled = false;

    const check = () => {
      if (settled) return;
      attempts++;

      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        if (settled) return;
        settled = true;
        isReady = true;
        res.resume();
        resolve(port);
      });

      let reqHandled = false;

      req.on('error', () => {
        if (reqHandled || settled) return;
        reqHandled = true;
        if (attempts >= maxAttempts) {
          settled = true;
          reject(new Error(`Server not ready after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      req.setTimeout(2000, () => {
        if (reqHandled || settled) return;
        reqHandled = true;
        req.destroy();
        if (attempts >= maxAttempts) {
          settled = true;
          reject(new Error(`Server timeout after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };

    check();
  });
}

/**
 * Starts the standalone Agent Town server child process.
 */
export async function startAgentTownServer(port = 3000): Promise<number | null> {
  serverPort = port;
  const agentTownPath = getAgentTownPath();

  if (!agentTownPath) {
    log.error('Agent Town project not found!');
    return null;
  }

  log.info('========================================');
  log.info('Agent Town Server Starting...');
  log.info(`Log file: ${LOG_FILE}`);
  log.info(`agentTownPath: ${agentTownPath}`);
  log.info(`process.execPath: ${process.execPath}`);

  const isProduction =
    fs.existsSync(path.join(agentTownPath, 'server.js')) &&
    fs.existsSync(path.join(agentTownPath, '.next', 'required-server-files.json'));

  log.info(`Mode: ${isProduction ? '🏭 PRODUCTION' : '🔧 DEVELOPMENT'}`);
  log.info('========================================');

  const hermesPath = getHermesPath();
  const bridgePort = getActualBridgePort() || 18789;

  const env: Record<string, string> = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: isProduction ? 'production' : 'development',
    AGENT_PROVIDER: 'hermes',
    NEXT_PUBLIC_AGENT_PROVIDER: 'hermes',
    GATEWAY_URL: `ws://127.0.0.1:${bridgePort}/`,
    ...getProviderApiKeyEnv(),
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (hermesPath) {
    env.HERMES_PROJECT_PATH = hermesPath;
  }

  // Clear stale port holder
  await killProcessOnPort(port).catch(() => {});
  clearNextLockFiles(agentTownPath);

  await new Promise((resolve) => setTimeout(resolve, 600));

  try {
    const serverScript = path.join(agentTownPath, 'server.js');
    if (!fs.existsSync(serverScript)) {
      log.error('Production server.js not found in agent-town directory!');
      return null;
    }

    log.info(`Using standalone server.js via process.execPath`);
    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: agentTownPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });

    serverProcess.stdout?.on('data', (chunk) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) log.info(`[stdout] ${msg}`);
    });

    serverProcess.stderr?.on('data', (chunk) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) log.warn(`[stderr] ${msg}`);
    });

    serverProcess.on('error', (err) => {
      log.error(`Spawn error: ${err.message}`);
      isReady = false;
      serverProcess = null;
    });

    serverProcess.on('close', (code, signal) => {
      log.info(`Server process exited — code: ${code}, signal: ${signal}`);
      isReady = false;
      serverProcess = null;
    });

    const readyPort = await waitForReady(port, 90, 1000);
    log.info(`✅ Agent Town server ready on http://127.0.0.1:${readyPort}`);
    return readyPort;
  } catch (err: any) {
    log.error(`Failed to start server: ${err.message}`);
    stopAgentTownServer();
    return null;
  }
}

/**
 * Stops the Agent Town server and kills any lingering child processes.
 */
export function stopAgentTownServer(): void {
  if (!serverProcess) return;

  log.info('Stopping Agent Town server...');
  isReady = false;

  try {
    if (process.platform === 'win32' && serverProcess.pid) {
      exec(`taskkill /pid ${serverProcess.pid} /f /t`, { windowsHide: true }, () => {});
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch (err: any) {
    log.warn(`Error stopping server: ${err.message}`);
  }

  serverProcess = null;
}

export function getServerUrl(): string | null {
  return isReady ? `http://127.0.0.1:${serverPort}` : null;
}

export function isServerReady(): boolean {
  return isReady && serverProcess !== null;
}
