/**
 * Agent Town Server Manager
 *
 * Spawns and manages the standalone Agent Town Next.js server child process
 * on localhost:3000 to serve the Phaser 3 pixel-art office simulation.
 */

import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { app } from 'electron';

let serverProcess: ChildProcess | null = null;
let isReady = false;
let currentPort = 3000;

function log(level: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  console.log(`[Agent Town Server] [${timestamp}] [${level}] ${msg}`);
}

/**
 * Kill any stale process currently occupying the port (Windows: netstat + taskkill).
 */
async function clearPort(port: number): Promise<void> {
  if (process.platform !== 'win32') return;

  return new Promise<void>((resolve) => {
    exec(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) return resolve();

      const lines = stdout.split('\n');
      const pids = new Set<string>();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== String(process.pid)) {
          pids.add(pid);
        }
      }

      if (pids.size === 0) return resolve();

      for (const pid of pids) {
        log('WARN', `Port ${port} in use by PID ${pid}. Terminating stale process...`);
        try {
          exec(`taskkill /pid ${pid} /f /t`, () => {});
        } catch {
          // ignore
        }
      }
      setTimeout(resolve, 500);
    });
  });
}

/**
 * Clean up Next.js lock files to prevent stale lock errors.
 */
function cleanNextLocks(agentTownDir: string) {
  const lockFiles = [
    path.join(agentTownDir, '.next', 'dev', 'lock'),
    path.join(agentTownDir, '.next', 'lockfile'),
    path.join(agentTownDir, '.next', 'cache', 'lockfile'),
  ];
  for (const lock of lockFiles) {
    if (fs.existsSync(lock)) {
      try {
        fs.unlinkSync(lock);
        log('INFO', `Removed stale lock file: ${lock}`);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Resolves the absolute directory containing Agent Town server files.
 */
export function getAgentTownPath(): string | null {
  if (process.env.AGENT_TOWN_PATH && fs.existsSync(process.env.AGENT_TOWN_PATH)) {
    return path.resolve(process.env.AGENT_TOWN_PATH);
  }

  // 1. Packaged extraResources
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'agent-town');
    if (fs.existsSync(path.join(packagedPath, 'server.js'))) {
      return packagedPath;
    }
  }

  // 2. Local workspace resources/agent-town
  const localResources = path.resolve(process.cwd(), 'resources', 'agent-town');
  if (fs.existsSync(path.join(localResources, 'server.js'))) {
    return localResources;
  }

  // 3. Fallback via app.getAppPath()
  try {
    const appPath = path.join(app.getAppPath(), 'resources', 'agent-town');
    if (fs.existsSync(path.join(appPath, 'server.js'))) {
      return appPath;
    }
    const parentAppPath = path.join(app.getAppPath(), '..', 'resources', 'agent-town');
    if (fs.existsSync(path.join(parentAppPath, 'server.js'))) {
      return parentAppPath;
    }
  } catch {
    // app might not be initialized in unit tests
  }

  // 4. Installed Akki Ai fallback
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

  try {
    const roamingInstalled = path.join(
      os.homedir(),
      'AppData',
      'Roaming',
      'Programs',
      'akki_ai',
      'resources',
      'agent-town'
    );
    if (fs.existsSync(path.join(roamingInstalled, 'server.js'))) {
      return roamingInstalled;
    }
  } catch {}

  return null;
}

/**
 * Pings http://127.0.0.1:port until ready or timeout.
 */
function waitForReady(port: number, maxAttempts = 40, intervalMs = 600): Promise<number> {
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

      req.on('error', () => {
        if (settled) return;
        if (attempts >= maxAttempts) {
          settled = true;
          reject(new Error(`Agent Town server failed to respond on port ${port} after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      req.setTimeout(1500, () => {
        req.destroy();
      });
    };

    check();
  });
}

/**
 * Starts the standalone Agent Town server child process.
 */
export async function startAgentTownServer(port = 3000): Promise<number | null> {
  currentPort = port;
  const agentTownDir = getAgentTownPath();

  if (!agentTownDir) {
    log('ERROR', 'Agent Town directory not found in resources/agent-town');
    return null;
  }

  const serverScript = path.join(agentTownDir, 'server.js');
  if (!fs.existsSync(serverScript)) {
    log('ERROR', `server.js not found at: ${serverScript}`);
    return null;
  }

  log('INFO', `Starting Agent Town server from ${agentTownDir} on port ${port}...`);

  // Clear any zombie process holding port 3000
  await clearPort(port);
  cleanNextLocks(agentTownDir);

  try {
    // Use Electron's embedded Node runtime (ELECTRON_RUN_AS_NODE: '1') or system node
    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: agentTownDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
      },
      windowsHide: true,
    });

    serverProcess.stdout?.on('data', (chunk) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) log('INFO', `[stdout] ${msg}`);
    });

    serverProcess.stderr?.on('data', (chunk) => {
      const msg = chunk.toString('utf-8').trim();
      if (msg) log('WARN', `[stderr] ${msg}`);
    });

    serverProcess.on('error', (err) => {
      log('ERROR', `Spawn error: ${err.message}`);
      isReady = false;
      serverProcess = null;
    });

    serverProcess.on('close', (code) => {
      log('INFO', `Agent Town server process exited with code ${code}`);
      isReady = false;
      serverProcess = null;
    });

    // Wait for HTTP ping to succeed
    const readyPort = await waitForReady(port, 45, 600);
    log('INFO', `✅ Agent Town server is live and responding on http://127.0.0.1:${readyPort}`);
    return readyPort;
  } catch (err: any) {
    log('ERROR', `Failed to start server: ${err.message}`);
    stopAgentTownServer();
    return null;
  }
}

/**
 * Stops the Agent Town server and kills any lingering child processes.
 */
export function stopAgentTownServer(): void {
  if (!serverProcess) return;

  log('INFO', 'Stopping Agent Town server...');
  isReady = false;

  try {
    if (process.platform === 'win32' && serverProcess.pid) {
      exec(`taskkill /pid ${serverProcess.pid} /f /t`, { windowsHide: true }, () => {});
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch (err: any) {
    log('WARN', `Error stopping server: ${err.message}`);
  }

  serverProcess = null;
}

export function getServerUrl(): string | null {
  return isReady ? `http://127.0.0.1:${currentPort}` : null;
}

export function isServerReady(): boolean {
  return isReady && serverProcess !== null;
}
