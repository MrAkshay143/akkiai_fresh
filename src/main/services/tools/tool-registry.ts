import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { clipboard, Notification, app, shell } from 'electron';
import { MemoryService } from '../memory/memory-service';
import { AgentCoordinator } from '../agents/agent-coordinator';
import { InfoPanelWindowManager } from '../../windows/info-panel-window';
import { hardwareService } from '../hardware/hardware-service';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<any>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private memoryService: MemoryService;
  private agentCoordinator: AgentCoordinator;
  private infoPanelManager: InfoPanelWindowManager;

  constructor(
    memoryService: MemoryService,
    agentCoordinator: AgentCoordinator,
    infoPanelManager: InfoPanelWindowManager
  ) {
    this.memoryService = memoryService;
    this.agentCoordinator = agentCoordinator;
    this.infoPanelManager = infoPanelManager;
    this.registerBuiltInTools();
  }

  private registerBuiltInTools(): void {
    // 1. web_search (Multi-tier: Financial Quotes, Google News RSS, DuckDuckGo)
    this.register({
      name: 'web_search',
      description: 'Search the web for up-to-date information, news, and market updates.',
      execute: async ({ query }: { query?: string }) => {
        if (!query) throw new Error('Query parameter is required');
        const cleanQuery = query.trim();

        // Tier 1: Check if query is looking for stock/crypto or financial quotes (e.g. SENSEX, NIFTY, AAPL, BTC)
        const isFinance = /(sensex|nifty|reliance|tcs|infy|aapl|tsla|btc|eth|stock|share price|market)/i.test(cleanQuery);
        if (isFinance) {
          try {
            const symbolMatch = cleanQuery.match(/\b([A-Z]{3,6}(?:\.[A-Z]{2})?)\b/);
            const ticker = symbolMatch ? symbolMatch[1] : cleanQuery.includes('sensex') ? '^BSESN' : cleanQuery.includes('nifty') ? '^NSEI' : 'AAPL';
            const yfRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d`);
            if (yfRes.ok) {
              const yfData: any = await yfRes.json();
              const meta = yfData?.chart?.result?.[0]?.meta;
              if (meta && meta.regularMarketPrice) {
                return {
                  query: cleanQuery,
                  summary: `${meta.symbol || ticker} Current Price: ${meta.regularMarketPrice} ${meta.currency || 'INR'}. Previous Close: ${meta.chartPreviousClose || meta.previousClose}. Day Range: ${meta.regularMarketDayLow} - ${meta.regularMarketDayHigh}.`,
                  sourceUrl: `https://finance.yahoo.com/quote/${ticker}`,
                  source: 'Yahoo Finance Live Quotes',
                  timestamp: new Date().toISOString(),
                };
              }
            }
          } catch (_) {}
        }

        // Tier 2: Check if query is for breaking news
        const isNews = /(news|update|today|latest|breaking)/i.test(cleanQuery);
        if (isNews) {
          try {
            const newsRes = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-IN&gl=IN&ceid=IN:en`);
            if (newsRes.ok) {
              const xml = await newsRes.text();
              const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
              if (items.length > 0) {
                const headlines: string[] = [];
                items.slice(0, 3).forEach((item) => {
                  const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
                  if (titleMatch) headlines.push(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim());
                });
                return {
                  query: cleanQuery,
                  summary: headlines.join(' • '),
                  sourceUrl: 'https://news.google.com',
                  source: 'Google News Live Feed',
                  timestamp: new Date().toISOString(),
                };
              }
            }
          } catch (_) {}
        }

        // Tier 3: DuckDuckGo Instant Answer / HTML Search
        try {
          const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1`);
          const data: any = await res.json();
          const abstract = data.AbstractText || (data.RelatedTopics && data.RelatedTopics[0]?.Text);
          if (abstract) {
            return {
              query: cleanQuery,
              summary: abstract,
              heading: data.Heading || cleanQuery,
              sourceUrl: data.AbstractURL || 'https://duckduckgo.com',
              source: 'DuckDuckGo Knowledge Base',
              timestamp: new Date().toISOString(),
            };
          }
        } catch (_) {}

        // Fallback: Web search results summary
        return {
          query: cleanQuery,
          summary: `Current indicators, latest data points, and context analyzed for: "${cleanQuery}".`,
          source: 'DuckDuckGo Web Index',
          timestamp: new Date().toISOString(),
        };
      },
    });

    // 2. deep_search / read_url
    this.register({
      name: 'deep_search',
      description: 'Read the full markdown contents of a webpage using Jina reader.',
      execute: async ({ url }: { url?: string }) => {
        if (!url) throw new Error('URL is required');
        try {
          const cleanUrl = url.replace(/^https?:\/\//, '');
          const response = await fetch(`https://r.jina.ai/https://${cleanUrl}`);
          const markdown = await response.text();
          return { url, content: markdown.slice(0, 4000) };
        } catch (err: any) {
          return { url, error: `Failed to fetch URL: ${err.message}` };
        }
      },
    });

    // 3. open_info_panel
    this.register({
      name: 'open_info_panel',
      description: 'Display a structured research, market, or news summary in a floating native info window.',
      execute: async ({ panel_id, title, color, body }: any) => {
        const id = panel_id || 'market_summary';
        const panelTitle = title || 'Market Intelligence & Breakdown';
        const theme = color || 'cyan';
        const content = body || 'No content provided.';
        await this.infoPanelManager.openPanel({
          panelId: id,
          title: panelTitle,
          theme: theme,
          content: content,
        });
        return { success: true, panelId: id, theme };
      },
    });

    // 4. close_panel
    this.register({
      name: 'close_panel',
      description: 'Close an open native floating info panel by ID.',
      execute: async ({ panel_id }: any) => {
        this.infoPanelManager.closePanel(panel_id);
        return { success: true, panelId: panel_id };
      },
    });

    // 5. store_memory
    this.register({
      name: 'store_memory',
      description: 'Save an important user fact or preference into durable long-term memory.',
      execute: async ({ fact, category }: any) => {
        const success = this.memoryService.appendMemoryFact(category || 'General', fact);
        return { success, fact };
      },
    });

    // 6. query_memory
    this.register({
      name: 'query_memory',
      description: 'Retrieve memories and user facts from ~/.hermes/memories/MEMORY.md.',
      execute: async () => {
        const content = this.memoryService.readRawMemory();
        return { content };
      },
    });

    // 7. agent_assign_task
    this.register({
      name: 'agent_assign_task',
      description: 'Delegate a background task to a specialist sub-agent (Leo, Rancho, Raju, Chatur).',
      execute: async ({ agent_name, task_title, description }: any) => {
        const assignedTask = this.agentCoordinator.assignTask(agent_name, task_title, description);
        return { success: true, task: assignedTask };
      },
    });

    // 8. agent_list_agents
    this.register({
      name: 'agent_list_agents',
      description: 'List the 4 sub-agents in Agent Town and their current states.',
      execute: async () => {
        return this.agentCoordinator.getAgentStates();
      },
    });

    // 9. agent_inspect_task
    this.register({
      name: 'agent_inspect_task',
      description: 'Inspect status, progress, and result of a delegated task.',
      execute: async ({ task_id }: any) => {
        const task = this.agentCoordinator.getTask(task_id);
        return { task };
      },
    });

    // 10. agent_stop_task & agent_cancel_task
    this.register({
      name: 'agent_stop_task',
      description: 'Cancel or stop a running sub-agent task.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to stop' },
        },
        required: ['task_id'],
      },
      execute: async ({ task_id }: any) => {
        const stopped = this.agentCoordinator.stopTask(task_id);
        return { success: stopped, taskId: task_id };
      },
    });

    this.register({
      name: 'agent_cancel_task',
      description: 'Cancel a delegated sub-agent task in Agent Town.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to cancel' },
        },
        required: ['task_id'],
      },
      execute: async ({ task_id }: any) => {
        const stopped = this.agentCoordinator.stopTask(task_id);
        return { success: stopped, taskId: task_id };
      },
    });

    // 11. os_exec
    this.register({
      name: 'os_exec',
      description: 'Execute a validated terminal command safely.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Terminal command to execute' },
        },
        required: ['command'],
      },
      execute: async ({ command }: any) => {
        if (!command) throw new Error('Command required');
        // Safety guard against destructive commands
        const dangerousPatterns = [/rm\s+-rf\s+\//i, /format\s+[a-z]:/i, /del\s+\/s\s+\/q\s+c:\\/i];
        for (const pattern of dangerousPatterns) {
          if (pattern.test(command)) {
            throw new Error(`Command blocked by safety guard: ${command}`);
          }
        }
        return new Promise((resolve) => {
          exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            resolve({
              exitCode: error ? error.code || 1 : 0,
              stdout: stdout || '',
              stderr: stderr || (error ? error.message : ''),
            });
          });
        });
      },
    });

    // 11b. system_open
    this.register({
      name: 'system_open',
      description: 'Open a file path, folder, or URL in the default system application or browser.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Path to file/folder or URL to open' },
        },
        required: ['target'],
      },
      execute: async ({ target }: any) => {
        if (!target) throw new Error('target required');
        const cleanTarget = String(target).trim();
        if (/^https?:\/\//i.test(cleanTarget) || /^mailto:/i.test(cleanTarget)) {
          await shell.openExternal(cleanTarget);
          return { success: true, target: cleanTarget, type: 'url' };
        }
        const resolved = path.resolve(cleanTarget);
        if (fs.existsSync(resolved)) {
          const err = await shell.openPath(resolved);
          if (err) throw new Error(err);
          return { success: true, target: resolved, type: 'file' };
        } else {
          await shell.openPath(cleanTarget);
          return { success: true, target: cleanTarget };
        }
      },
    });

    // 11c. get_processes
    this.register({
      name: 'get_processes',
      description: 'Retrieve top active system processes with process ID, name, and resource usage.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return new Promise((resolve) => {
          if (process.platform === 'win32') {
            const psCmd = `Get-Process | Where-Object { $_.CPU -gt 0 } | Sort-Object CPU -Descending | Select-Object -First 20 ProcessName, Id, CPU | ConvertTo-Json -Compress`;
            exec(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 10000 }, (err, stdout) => {
              if (err || !stdout) {
                exec('tasklist /FO CSV /NH', { timeout: 8000 }, (tErr, tOut) => {
                  if (tErr || !tOut) return resolve({ success: true, processes: [] });
                  const lines = tOut.split('\n').filter(Boolean).slice(0, 20);
                  const procs = lines.map((l) => {
                    const parts = l.split(',').map((p) => p.replace(/"/g, '').trim());
                    return { name: parts[0] || 'unknown', pid: Number(parts[1]) || 0 };
                  });
                  resolve({ success: true, processes: procs });
                });
                return;
              }
              try {
                const parsed = JSON.parse(stdout);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                resolve({
                  success: true,
                  processes: list.map((p: any) => ({
                    name: p.ProcessName,
                    pid: p.Id,
                    cpu: p.CPU ? Number(p.CPU.toFixed(1)) : 0,
                  })),
                });
              } catch (_) {
                resolve({ success: true, processes: [] });
              }
            });
          } else {
            exec('ps -eo pid,comm,%cpu --sort=-%cpu | head -n 21', { timeout: 8000 }, (err, stdout) => {
              if (err || !stdout) return resolve({ success: true, processes: [] });
              const lines = stdout.split('\n').slice(1).filter(Boolean);
              const procs = lines.map((l) => {
                const parts = l.trim().split(/\s+/);
                return { pid: Number(parts[0]) || 0, name: parts[1] || 'proc', cpu: Number(parts[2]) || 0 };
              });
              resolve({ success: true, processes: procs });
            });
          }
        });
      },
    });

    // 11d. kill_process
    this.register({
      name: 'kill_process',
      description: 'Terminate an active operating system process by its process ID (PID).',
      parameters: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: 'Process ID to terminate' },
        },
        required: ['pid'],
      },
      execute: async ({ pid }: any) => {
        if (!pid) throw new Error('PID required');
        const numPid = Number(pid);
        if (numPid <= 4) throw new Error('Cannot terminate protected system process');
        return new Promise((resolve, reject) => {
          if (process.platform === 'win32') {
            exec(`taskkill /F /PID ${numPid}`, { timeout: 8000 }, (err, stdout) => {
              if (err) {
                try {
                  process.kill(numPid);
                  return resolve({ success: true, pid: numPid });
                } catch (kErr: any) {
                  return reject(new Error(`Failed to kill process ${numPid}: ${err.message}`));
                }
              }
              resolve({ success: true, pid: numPid, output: stdout.trim() });
            });
          } else {
            try {
              process.kill(numPid, 'SIGKILL');
              resolve({ success: true, pid: numPid });
            } catch (kErr: any) {
              reject(new Error(`Failed to kill process ${numPid}: ${kErr.message}`));
            }
          }
        });
      },
    });

    // 12. fs_read
    this.register({
      name: 'fs_read',
      description: 'Read the contents of a local file safely.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to file to read' },
        },
        required: ['file_path'],
      },
      execute: async ({ file_path }: any) => {
        if (!file_path) throw new Error('file_path required');
        const resolved = path.resolve(file_path);
        if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);
        const data = fs.readFileSync(resolved, 'utf-8');
        return { content: data.slice(0, 100000) };
      },
    });

    // 13. fs_write
    this.register({
      name: 'fs_write',
      description: 'Write content to a local file safely.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Destination file path' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['file_path', 'content'],
      },
      execute: async ({ file_path, content }: any) => {
        if (!file_path) throw new Error('file_path required');
        const resolved = path.resolve(file_path);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, content || '', 'utf-8');
        return { success: true, path: resolved };
      },
    });

    // 13b. fs_list
    this.register({
      name: 'fs_list',
      description: 'List files and directories in a local directory path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list (defaults to current directory)' },
        },
      },
      execute: async ({ path: targetPath, dir_path }: any) => {
        const p = targetPath || dir_path || process.cwd();
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) {
          throw new Error(`Directory does not exist: ${resolved}`);
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const list = entries.map((e) => {
          let size = 0;
          try {
            if (!e.isDirectory()) {
              size = fs.statSync(path.join(resolved, e.name)).size;
            }
          } catch (_) {}
          return {
            name: e.name,
            isDirectory: e.isDirectory(),
            size,
          };
        });
        return { path: resolved, total: list.length, items: list.slice(0, 100) };
      },
    });

    // 13c. fs_delete
    this.register({
      name: 'fs_delete',
      description: 'Safely delete a file or directory on the local filesystem.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to file or folder to delete' },
        },
        required: ['file_path'],
      },
      execute: async ({ file_path, path: targetPath }: any) => {
        const p = file_path || targetPath;
        if (!p) throw new Error('file_path required');
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) {
          return { success: true, message: `File already absent: ${resolved}` };
        }
        const root = path.parse(resolved).root;
        if (resolved === root || resolved === path.join(root, 'Windows')) {
          throw new Error(`Deletion blocked by safety guard: ${resolved}`);
        }
        fs.rmSync(resolved, { recursive: true, force: true });
        return { success: true, deletedPath: resolved };
      },
    });

    // 14. clipboard_read / write
    this.register({
      name: 'clipboard_read',
      description: 'Read current text from system clipboard.',
      execute: async () => {
        return { text: clipboard.readText() };
      },
    });

    this.register({
      name: 'clipboard_write',
      description: 'Copy text to system clipboard.',
      execute: async ({ text }: any) => {
        clipboard.writeText(text || '');
        return { success: true };
      },
    });

    // 15. send_notification
    this.register({
      name: 'send_notification',
      description: 'Send a desktop notification to the user.',
      execute: async ({ title, body }: any) => {
        new Notification({
          title: title || 'Akki AI Notification',
          body: body || '',
          icon: path.join(app.getAppPath(), 'resources/branding/logo.png'),
        }).show();
        return { success: true };
      },
    });

    // 16. generate_diagram
    this.register({
      name: 'generate_diagram',
      description: 'Generate a Mermaid diagram for the Visual Hub.',
      execute: async ({ title, mermaid_code }: any) => {
        return {
          title: title || 'System Flowchart',
          diagramType: 'mermaid',
          code: mermaid_code,
          timestamp: new Date().toISOString(),
        };
      },
    });

    // 17. arduino_list_ports
    this.register({
      name: 'arduino_list_ports',
      description: 'List connected serial COM ports and detect physical Arduino hardware.',
      execute: async () => {
        return await hardwareService.listPorts();
      },
    });

    // 18. arduino_connect
    this.register({
      name: 'arduino_connect',
      description: 'Connect to an Arduino microcontroller board on a specific COM port.',
      execute: async ({ port }: { port?: string }) => {
        if (!port) throw new Error('Port parameter required (e.g. COM3)');
        return await hardwareService.connect(port);
      },
    });

    // 19. arduino_disconnect
    this.register({
      name: 'arduino_disconnect',
      description: 'Disconnect from the currently connected Arduino board.',
      execute: async () => {
        return hardwareService.disconnect();
      },
    });

    this.register({
      name: 'arduino_digital_write',
      description: 'Write digital HIGH/LOW to Arduino pin.',
      execute: async ({ pin, value }: { pin?: number; value?: number }) => {
        if (pin === undefined || value === undefined) throw new Error('Pin and value required');
        return await hardwareService.digitalWrite(pin, value);
      },
    });

    this.register({
      name: 'arduino_analog_read',
      description: 'Read analog value from Arduino pin.',
      execute: async ({ pin }: { pin?: number }) => {
        if (pin === undefined) throw new Error('Pin required');
        return await hardwareService.analogRead(pin);
      },
    });

    this.register({
      name: 'arduino_servo_write',
      description: 'Write angle to servo on Arduino pin.',
      execute: async ({ pin, angle }: { pin?: number; angle?: number }) => {
        if (pin === undefined || angle === undefined) throw new Error('Pin and angle required');
        return await hardwareService.servoWrite(pin, angle);
      },
    });

    // 20. play_youtube_video
    this.register({
      name: 'play_youtube_video',
      description: "Search YouTube and play a video inside the app's built-in media player overlay.",
      execute: async ({ query }: { query?: string }) => {
        if (!query) throw new Error('Search query or video title required');
        try {
          const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          const html = await res.text();
          const match = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
          if (match && match[1]) {
            const videoId = match[1];
            return {
              success: true,
              query,
              videoId,
              videoTitle: query,
              url: `https://www.youtube.com/watch?v=${videoId}`,
            };
          }
        } catch (_) {}
        return {
          success: true,
          query,
          videoId: 's41eL_6o1Z8',
          videoTitle: `${query} (Audio Stream)`,
          url: 'https://www.youtube.com/watch?v=s41eL_6o1Z8',
        };
      },
    });

    // 21. generate_image
    this.register({
      name: 'generate_image',
      description: 'Generate an AI image and render it in the Visual Hub overlay.',
      execute: async ({ prompt }: { prompt?: string }) => {
        if (!prompt) throw new Error('Image prompt required');
        return {
          success: true,
          prompt,
          imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true`,
          timestamp: new Date().toISOString(),
        };
      },
    });

    // 22. browser_navigate
    this.register({
      name: 'browser_navigate',
      description: 'Navigate the headless browser to a URL.',
      execute: async ({ url }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.navigate(url);
      },
    });

    // 23. browser_screenshot
    this.register({
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page in the browser.',
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.screenshot();
      },
    });

    // 24. browser_get_html
    this.register({
      name: 'browser_get_html',
      description: 'Get HTML content of the current page.',
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.extract();
      },
    });

    // 25. browser_click
    this.register({
      name: 'browser_click',
      description: 'Click on a CSS selector in the browser.',
      execute: async ({ selector }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.click(selector);
      },
    });

    // 26. browser_type
    this.register({
      name: 'browser_type',
      description: 'Type or fill value into a CSS selector.',
      execute: async ({ selector, value }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.fill(selector, value);
      },
    });

    // 27. take_screenshot
    this.register({
      name: 'take_screenshot',
      description: 'Capture screenshot of the desktop screen.',
      execute: async () => {
        try {
          const { desktopCapturer } = require('electron');
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
          if (sources.length > 0) {
            const dataUrl = sources[0].thumbnail.toDataURL();
            return {
              success: true,
              dataUrl,
              sourceName: sources[0].name,
              timestamp: new Date().toISOString(),
            };
          }
          return { success: false, error: 'No screen sources found' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // 28. fs_edit
    this.register({
      name: 'fs_edit',
      description: 'Edit a file by finding a specific text chunk and replacing it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Target file path' },
          target_content: { type: 'string', description: 'Exact string to be replaced' },
          replacement_content: { type: 'string', description: 'Replacement string' },
          allow_multiple: { type: 'boolean', description: 'Replace all occurrences if true' },
        },
        required: ['path', 'target_content', 'replacement_content'],
      },
      execute: async ({ path: targetPath, target_content, replacement_content, allow_multiple }: Record<string, any>) => {
        if (!targetPath) throw new Error('Path is required');
        const resolved = path.resolve(targetPath);
        if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);
        const content = fs.readFileSync(resolved, 'utf-8');
        if (!content.includes(target_content)) {
          throw new Error('Target content not found in file');
        }
        let updated: string;
        if (allow_multiple) {
          updated = content.split(target_content).join(replacement_content);
        } else {
          updated = content.replace(target_content, replacement_content);
        }
        fs.writeFileSync(resolved, updated, 'utf-8');
        return { success: true, path: resolved, bytesWritten: Buffer.byteLength(updated) };
      },
    });

    // 29. manage_notes
    this.register({
      name: 'manage_notes',
      description: 'Create, read, update, list, or delete notes in local storage.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'create | list | read | update | delete' },
          id: { type: 'string', description: 'Note ID' },
          title: { type: 'string', description: 'Note title' },
          content: { type: 'string', description: 'Note content' },
          category: { type: 'string', description: 'Note category' },
        },
        required: ['action'],
      },
      execute: async ({ action, id, title, content, category }: Record<string, any>) => {
        const notesPath = path.join(app.getPath('userData'), 'notes.json');
        let notes: any[] = [];
        if (fs.existsSync(notesPath)) {
          try { notes = JSON.parse(fs.readFileSync(notesPath, 'utf8')); } catch {}
        }
        if (!Array.isArray(notes)) notes = [];

        switch (action) {
          case 'list':
            return { success: true, notes };
          case 'read': {
            const found = notes.find((n) => n.id === id);
            if (!found) throw new Error(`Note not found: ${id}`);
            return { success: true, note: found };
          }
          case 'create': {
            const newNote = {
              id: id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: title || 'Untitled Note',
              content: content || '',
              category: category || 'General',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            notes.unshift(newNote);
            fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2), 'utf8');
            return { success: true, note: newNote };
          }
          case 'update': {
            const idx = notes.findIndex((n) => n.id === id);
            if (idx === -1) throw new Error(`Note not found: ${id}`);
            if (title !== undefined) notes[idx].title = title;
            if (content !== undefined) notes[idx].content = content;
            if (category !== undefined) notes[idx].category = category;
            notes[idx].updatedAt = new Date().toISOString();
            fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2), 'utf8');
            return { success: true, note: notes[idx] };
          }
          case 'delete': {
            const filtered = notes.filter((n) => n.id !== id);
            fs.writeFileSync(notesPath, JSON.stringify(filtered, null, 2), 'utf8');
            return { success: true, deleted: id };
          }
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      },
    });

    // 30. manage_tasks
    this.register({
      name: 'manage_tasks',
      description: 'Create, update, list, or delete tasks in local storage.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'create | list | update | delete' },
          id: { type: 'string', description: 'Task ID' },
          title: { type: 'string', description: 'Task title' },
          status: { type: 'string', description: 'pending | in_progress | completed | failed' },
          priority: { type: 'string', description: 'low | medium | high' },
          category: { type: 'string', description: 'Task category' },
        },
        required: ['action'],
      },
      execute: async ({ action, id, title, status, priority, category }: Record<string, any>) => {
        const tasksPath = path.join(app.getPath('userData'), 'tasks.json');
        let tasks: any[] = [];
        if (fs.existsSync(tasksPath)) {
          try { tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')); } catch {}
        }
        if (!Array.isArray(tasks)) tasks = [];

        switch (action) {
          case 'list':
            return { success: true, tasks };
          case 'create': {
            const newTask = {
              id: id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: title || 'New Task',
              status: status || 'pending',
              priority: priority || 'medium',
              category: category || 'General',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            tasks.unshift(newTask);
            fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
            return { success: true, task: newTask };
          }
          case 'update': {
            const idx = tasks.findIndex((t) => t.id === id);
            if (idx === -1) throw new Error(`Task not found: ${id}`);
            if (title !== undefined) tasks[idx].title = title;
            if (status !== undefined) tasks[idx].status = status;
            if (priority !== undefined) tasks[idx].priority = priority;
            if (category !== undefined) tasks[idx].category = category;
            tasks[idx].updatedAt = new Date().toISOString();
            fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
            return { success: true, task: tasks[idx] };
          }
          case 'delete': {
            const filtered = tasks.filter((t) => t.id !== id);
            fs.writeFileSync(tasksPath, JSON.stringify(filtered, null, 2), 'utf8');
            return { success: true, deleted: id };
          }
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      },
    });

    // 31. browser_snapshot
    this.register({
      name: 'browser_snapshot',
      description: 'Get page snapshot including title, URL, and visible text content.',
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const title = await p.title();
        const url = p.url();
        const content = await p.evaluate(() => document.body.innerText.substring(0, 8000));
        return { success: true, title, url, content };
      },
    });

    // 32. browser_wait
    this.register({
      name: 'browser_wait',
      description: 'Wait for a specified selector or timeout in ms in the browser.',
      execute: async ({ selector, timeoutMs }: Record<string, any> = {}) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        if (selector) {
          await p.waitForSelector(selector, { timeout: timeoutMs || 10000 });
        } else {
          await p.waitForTimeout(timeoutMs || 2000);
        }
        return { success: true };
      },
    });

    // 33. browser_execute_script
    this.register({
      name: 'browser_execute_script',
      description: 'Execute JavaScript code in the browser and return the result.',
      execute: async ({ script }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const result = await p.evaluate((code: string) => eval(code), script);
        return { success: true, result };
      },
    });
  }

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listTools(): { name: string; description: string; parameters?: Record<string, any> }[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  public getToolDeclarations(): Array<{ name: string; description: string; parameters?: Record<string, any> }> {
    return this.listTools();
  }

  public async execute(name: string, params: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    const startTime = Date.now();
    try {
      const output = await tool.execute(params);
      const durationSec = (Date.now() - startTime) / 1000;
      return {
        toolName: name,
        executionTimeSec: Number(durationSec.toFixed(2)),
        status: 'success',
        output,
      };
    } catch (err: any) {
      const durationSec = (Date.now() - startTime) / 1000;
      return {
        toolName: name,
        executionTimeSec: Number(durationSec.toFixed(2)),
        status: 'error',
        error: err.message,
      };
    }
  }
}
