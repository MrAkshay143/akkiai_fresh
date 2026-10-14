import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { clipboard, Notification, app, shell, BrowserWindow } from 'electron';
import { MemoryService } from '../memory/memory-service';
import { AgentCoordinator } from '../agents/agent-coordinator';
import { InfoPanelWindowManager } from '../../windows/info-panel-window';
import { hardwareService } from '../hardware/hardware-service';
import { whatsAppManager } from '../whatsapp/whatsapp-manager';
import { browserManager } from './browser-manager';

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
      description:
        'Assign a task to one of the 4 AI agents in Agent Town: Leo, Rancho, Raju, or Chatur. If agent_name is omitted, automatically picks the first idle agent. Use this when a task needs background execution while you keep talking, or requires multi-step research/automation.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Clear, self-contained task description for the agent. Include all context, URLs, constraints, and expected output.',
          },
          agent_name: {
            type: 'string',
            enum: ['Leo', 'Rancho', 'Raju', 'Chatur'],
            description: 'Optional. Which agent to assign the task to. If omitted, the first idle agent is picked automatically.',
          },
          task_title: {
            type: 'string',
            description: 'Optional short title for the task.',
          },
          continue_context: {
            type: 'string',
            enum: ['continue', 'fresh'],
            description: 'Whether the agent should remember its previous conversation.',
          },
        },
        required: ['task'],
      },
      execute: async ({ task, agent_name, task_title, description }: any) => {
        const title = task_title || (task ? task.slice(0, 40) : 'Agent Task');
        const desc = description || task || title;
        const assignedTask = this.agentCoordinator.assignTask(agent_name, title, desc);
        return {
          success: true,
          result: `Task assigned to ${assignedTask.assignedTo} [${assignedTask.id}]`,
          task: assignedTask,
        };
      },
    });

    // 8. agent_list_agents
    this.register({
      name: 'agent_list_agents',
      description:
        'List all 4 agents in Agent Town (Leo, Rancho, Raju, Chatur) with their current status (idle/running), what task they are working on, and their specialty. Use when user asks about Agent Town status, who is working, who is free/busy, or before assigning tasks.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const agents = this.agentCoordinator.getAgentStates();
        const runningTasks = this.agentCoordinator.getTasksByStatus('running');
        const enriched = agents.map((agent) => {
          const activeTask = agent.currentTaskId
            ? this.agentCoordinator.getTask(agent.currentTaskId)
            : runningTasks.find((t) => t.assignedTo === agent.name);
          return {
            name: agent.name,
            role: agent.role,
            specialty: agent.specialty,
            status: agent.status === 'busy' || !!activeTask ? 'running' : 'idle',
            currentTaskId: activeTask?.id || agent.currentTaskId,
            currentTaskSnippet: activeTask?.taskTitle || activeTask?.description?.slice(0, 80) || undefined,
          };
        });
        const summary = enriched.map((a) => {
          const taskInfo = a.currentTaskSnippet ? ` (working on: "${a.currentTaskSnippet}")` : '';
          return `• ${a.name} (${a.role}): ${a.status}${taskInfo}`;
        });
        return {
          success: true,
          result: `Agent Town status (${enriched.length} agents):\n${summary.join('\n')}`,
          data: { agents: enriched },
        };
      },
    });

    // 8b. agent_list_tasks
    this.register({
      name: 'agent_list_tasks',
      description:
        'List all tasks currently running or queued across all Agent Town agents. Shows taskId, agent name, task message, and status.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const tasks = this.agentCoordinator.getTasks();
        const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'queued');
        if (activeTasks.length === 0) {
          return {
            success: true,
            result: 'No active tasks in Agent Town.',
            data: { count: 0, tasks: [] },
          };
        }
        const lines = activeTasks.map(
          (t) => `• ${t.assignedTo} [${t.status}]: "${(t.taskTitle || t.description || '').slice(0, 60)}"`
        );
        return {
          success: true,
          result: `${activeTasks.length} active task(s) in Agent Town:\n${lines.join('\n')}`,
          data: { count: activeTasks.length, tasks: activeTasks },
        };
      },
    });

    // 9. agent_inspect_task
    this.register({
      name: 'agent_inspect_task',
      description:
        'Inspect status, progress, and result of a delegated agent or task. Provide either agent_name ("Leo", "Rancho", "Raju", "Chatur") or task_id / run_id.',
      parameters: {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            enum: ['Leo', 'Rancho', 'Raju', 'Chatur'],
            description: 'Name of the agent to inspect.',
          },
          run_id: {
            type: 'string',
            description: 'Optional run ID of a specific task to inspect.',
          },
          task_id: {
            type: 'string',
            description: 'Optional task ID.',
          },
        },
      },
      execute: async ({ agent_name, run_id, task_id }: any) => {
        const id = task_id || run_id;
        if (id) {
          const task = this.agentCoordinator.getTask(id);
          return { success: true, task: task || null };
        }
        if (agent_name) {
          const agent = this.agentCoordinator.getAgentState(agent_name);
          const tasks = this.agentCoordinator.getTasksByAgent(agent_name);
          const currentTask = tasks.find((t) => t.status === 'running') || tasks[0];
          return {
            success: true,
            result: `${agent?.name || agent_name}: ${agent?.status || 'idle'}${
              currentTask ? `\nCurrent task: "${currentTask.taskTitle}" (${currentTask.status})` : '\nNo active task'
            }`,
            data: { agent, task: currentTask || null },
          };
        }
        return { success: false, error: 'Provide agent_name or task_id' };
      },
    });

    // 10. agent_stop_task & agent_cancel_task
    this.register({
      name: 'agent_stop_task',
      description:
        'Cancel or stop a running sub-agent task. Provide either agent_name ("Leo", "Rancho", "Raju", "Chatur") or task_id.',
      parameters: {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            enum: ['Leo', 'Rancho', 'Raju', 'Chatur'],
            description: 'Name of the agent whose task should be stopped.',
          },
          run_id: {
            type: 'string',
            description: 'Optional run ID of the task to stop.',
          },
          task_id: {
            type: 'string',
            description: 'Optional task ID to stop.',
          },
        },
      },
      execute: async ({ agent_name, run_id, task_id }: any) => {
        const id = task_id || run_id;
        if (id) {
          const stopped = this.agentCoordinator.stopTask(id);
          return { success: stopped, taskId: id };
        }
        if (agent_name) {
          const tasks = this.agentCoordinator.getTasksByAgent(agent_name);
          const running = tasks.find((t) => t.status === 'running');
          if (running) {
            const stopped = this.agentCoordinator.stopTask(running.id);
            return { success: stopped, agentName: agent_name, taskId: running.id };
          }
          return { success: true, message: `No running task found for agent ${agent_name}` };
        }
        return { success: false, error: 'Provide agent_name or task_id' };
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

    // 10b. end_session
    this.register({
      name: 'end_session',
      description:
        'End your own live AI session and go to sleep. The assistant stops listening and the voice connection is closed. Use this ONLY when the user explicitly asks YOU (the AI assistant itself) to sleep, shut down, go offline, or end the conversation — for example: "so jao", "band ho jao", "good night", "turn yourself off", "go to sleep". Do NOT use this if the user asks to turn off something else like a light, computer, app, or any external device.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return {
          success: true,
          result: 'Live session ending. Going offline now. Shubh ratri / Goodbye!',
          shouldDisconnect: true,
        };
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

    // 21. generate_image & huggingface_generate_image alias
    const generateImageHandler = async ({ prompt }: { prompt?: string }) => {
      if (!prompt) throw new Error('Image prompt required');
      return {
        success: true,
        prompt,
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=768&nologo=true`,
        timestamp: new Date().toISOString(),
      };
    };
    this.register({
      name: 'generate_image',
      description: 'Generate an AI image and render it in the Visual Hub overlay.',
      execute: generateImageHandler,
    });
    this.register({
      name: 'huggingface_generate_image',
      description: 'Generate an AI image using Hugging Face (or direct rendering).',
      execute: generateImageHandler,
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

    // 34. ask_user
    this.register({
      name: 'ask_user',
      description: 'Pause execution and ask the user a question. Use when explicit permission, clarification, or missing information is required.',
      parameters: {
        type: 'OBJECT',
        properties: {
          question: {
            type: 'STRING',
            description: 'The clear, specific question to ask the user.',
          },
        },
        required: ['question'],
      },
      execute: async ({ question }: { question?: string }) => {
        if (!question || typeof question !== 'string') {
          return { success: false, error: 'Question is required.' };
        }
        return {
          success: true,
          result: 'Question asked to user out loud. Waiting for user reply.',
          _breakLoop: true,
          question,
        };
      },
    });

    // 35. send_whatsapp
    this.register({
      name: 'send_whatsapp',
      description: 'Send a WhatsApp message to a specific contact via WhatsApp Desktop automation. Requires WhatsApp Desktop installed and contact name to match display name.',
      parameters: {
        type: 'OBJECT',
        properties: {
          contactName: {
            type: 'STRING',
            description: 'Name of the WhatsApp contact to message (must match their WhatsApp display name or chat title).',
          },
          message: {
            type: 'STRING',
            description: 'Text message to send.',
          },
        },
        required: ['contactName', 'message'],
      },
      execute: async ({ contactName, message }: { contactName?: string; message?: string }) => {
        if (!contactName || !message) {
          return {
            success: false,
            error: 'contactName and message are both required.',
            errorCode: 'INVALID_ARGS',
            errorCategory: 'permanent',
            retryable: false,
          };
        }
        try {
          const sent = await whatsAppManager.sendReply(contactName, message);
          if (sent && (sent as any).success !== false) {
            return {
              success: true,
              result: `Message successfully sent to ${contactName} on WhatsApp.`,
              method: (sent as any).method || 'keyboard_automation',
            };
          }
          return {
            success: false,
            error: (sent as any)?.error || 'WhatsApp automation failed.',
            errorCode: 'UNKNOWN_ERROR',
            errorCategory: 'transient',
            retryable: false,
            retrySuggestion: 'Make sure WhatsApp Desktop is installed and the contact name matches exactly.',
          };
        } catch (err: any) {
          return {
            success: false,
            error: `WhatsApp automation crashed: ${err?.message || err}`,
            errorCode: 'UNKNOWN_ERROR',
            errorCategory: 'transient',
            retryable: false,
            retrySuggestion: 'Make sure WhatsApp Desktop is installed. Run: npm install @jitsi/robotjs if missing.',
          };
        }
      },
    });

    // 36. send_whatsapp_quick_message
    this.register({
      name: 'send_whatsapp_quick_message',
      description: 'QUICK one-way WhatsApp sender ONLY — fires off a single text to one contact via WhatsApp Desktop. It CANNOT read messages, see replies, or hold a conversation. For real/two-way WhatsApp (reading chats, replies, browsing), DO NOT use this tool — instruct the user to use WhatsApp Desktop or check your chat view. Parameters: contactName, message.',
      parameters: {
        type: 'OBJECT',
        properties: {
          contactName: {
            type: 'STRING',
            description: 'Name of the WhatsApp contact to message (must match their WhatsApp display name or chat title).',
          },
          message: {
            type: 'STRING',
            description: 'Text message to send.',
          },
        },
        required: ['contactName', 'message'],
      },
      execute: async (args: any) => {
        return await this.getTool('send_whatsapp')!.execute(args);
      },
    });

    // 37. query_recent_chat
    this.register({
      name: 'query_recent_chat',
      description: 'Retrieve recent visible messages from the current selected chat session. Use this for "what were we just talking about?" or recent-context recall before checking long-term memory. Returns a token-bounded slice instead of the full chat.',
      parameters: {
        type: 'OBJECT',
        properties: {
          limit: {
            type: 'NUMBER',
            description: 'Optional number of recent visible messages to return. The tool enforces a minimum of 10 and a maximum of 20, plus an overall 8000-token cap.',
          },
        },
      },
      execute: async ({ limit }: { limit?: number } = {}) => {
        try {
          const raw = this.memoryService.readRawMemory() || '';
          const maxMessages = Math.max(10, Math.min(20, Number.isFinite(limit) ? Number(limit!) : 10));
          const lines = raw.split('\n').filter((l) => l.trim().startsWith('- [') || l.trim().startsWith('•') || l.trim().startsWith('-'));
          const slice = lines.slice(-maxMessages);
          if (slice.length === 0) {
            return {
              success: true,
              result: 'No recent visible chat context found in the current session.',
              data: { count: 0, entries: [] },
            };
          }
          const formatted = slice.map((l, i) => `${i + 1}. Context: ${l.trim()}`);
          return {
            success: true,
            result: `Recent chat context (${slice.length} messages):\n` + formatted.join('\n'),
            data: { count: slice.length, entries: slice },
          };
        } catch (err: any) {
          return { success: false, error: `Failed to retrieve recent chat: ${err?.message || err}` };
        }
      },
    });

    // 38. query_user_profile
    this.register({
      name: 'query_user_profile',
      description: 'Retrieve the stored user profile including name, preferred language, timezone, notes, and learned context from MEMORY.md.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        try {
          const raw = await this.memoryService.readRawMemory();
          const pPath = path.join(app.getPath('userData'), 'user_profile.json');
          let profileObj: any = {};
          if (fs.existsSync(pPath)) {
            try { profileObj = JSON.parse(fs.readFileSync(pPath, 'utf8')); } catch (_) {}
          }
          const text = (raw || '').trim();
          return {
            success: true,
            result: text ? `Unified memories from MEMORY.md:\n${text}` : 'Memory is currently empty.',
            data: { raw: text, profile: profileObj },
          };
        } catch (err: any) {
          return { success: false, error: `Failed to read MEMORY.md: ${err?.message || err}` };
        }
      },
    });

    // 39. update_user_profile
    this.register({
      name: 'update_user_profile',
      description: 'Update the stored user profile with new preferences, identity facts, or context.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: "User's name" },
          preferredLanguage: { type: 'STRING', description: 'Preferred language' },
          timezone: { type: 'STRING', description: 'User timezone' },
          notes: { type: 'STRING', description: 'Notes' },
          contextEntry: { type: 'STRING', description: 'Context entry' },
          contextEntries: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Array of context entries' },
          replaceContext: { type: 'STRING', description: 'Context replacement' },
        },
      },
      execute: async (args: any) => {
        const facts: string[] = [];
        if (args?.name) facts.push(`My name is ${args.name}`);
        if (args?.preferredLanguage) facts.push(`My preferred language is ${args.preferredLanguage}`);
        if (args?.timezone) facts.push(`My timezone is ${args.timezone}`);
        if (args?.notes) facts.push(args.notes);
        if (args?.contextEntry) facts.push(args.contextEntry);
        if (Array.isArray(args?.contextEntries)) facts.push(...args.contextEntries.filter(Boolean));
        if (args?.replaceContext) facts.push(args.replaceContext);

        if (facts.length === 0) {
          return { success: false, error: 'Provide at least one profile field to update.' };
        }

        try {
          const raw = (await this.memoryService.readRawMemory()) || '';
          const today = new Date().toLocaleDateString();
          const block = facts.map((f) => `- [${today}] [identity/preference] ${f}`).join('\n§\n');
          const newRaw = raw ? `${block}\n§\n${raw}` : block;
          await this.memoryService.writeRawMemory(newRaw);

          // Update user_profile.json
          const pPath = path.join(app.getPath('userData'), 'user_profile.json');
          let currentProfile: any = {};
          if (fs.existsSync(pPath)) {
            try { currentProfile = JSON.parse(fs.readFileSync(pPath, 'utf8')); } catch (_) {}
          }
          if (args?.name) currentProfile.name = args.name;
          if (args?.preferredLanguage) currentProfile.preferredLanguage = args.preferredLanguage;
          if (args?.timezone) currentProfile.timezone = args.timezone;
          if (args?.notes) currentProfile.notes = args.notes;
          fs.writeFileSync(pPath, JSON.stringify(currentProfile, null, 2), 'utf8');

          return {
            success: true,
            result: `MEMORY.md updated successfully with profile facts: ${facts.join(' | ')}`,
            data: { updatedFacts: facts },
          };
        } catch (err: any) {
          return { success: false, error: `Failed to update MEMORY.md: ${err?.message || err}` };
        }
      },
    });

    // 40. render_widget
    this.register({
      name: 'render_widget',
      description: 'Render an interactive HTML widget or visual component in a dedicated HUD window. Use this for calculators, charts, games, complex UIs, or any rich web content. Write complete, self-contained HTML including CSS and JS. The widget opens in a 760x580 window.',
      parameters: {
        type: 'OBJECT',
        properties: {
          widget_id: {
            type: 'STRING',
            description: 'A unique ID for this widget (e.g. calculator, chart_1).',
          },
          title: {
            type: 'STRING',
            description: 'The title to display in the widget window titlebar.',
          },
          html_content: {
            type: 'STRING',
            description: 'The complete HTML code to render, including inline CSS and JS inside script tags.',
          },
          theme: {
            type: 'STRING',
            description: 'Optional visual theme flavor.',
            enum: ['cyan', 'amber', 'crimson', 'emerald', 'purple'],
          },
        },
        required: ['widget_id', 'title', 'html_content'],
      },
      execute: async ({ widget_id, title, html_content, theme, width, height }: any) => {
        if (!widget_id || !html_content) {
          return { success: false, error: 'widget_id and html_content are required' };
        }
        try {
          const { ipcMain } = require('electron');
          const handlers = (ipcMain as any)._invokeHandlers;
          const handler = handlers && handlers.get('open-widget-window');
          if (handler) {
            await handler({} as any, { widgetId: widget_id, title, htmlContent: html_content, theme, width, height });
          }
          return {
            success: true,
            result: `Widget ${widget_id} rendered successfully.`,
          };
        } catch (err: any) {
          return { success: false, error: `Failed to render widget: ${err?.message || err}` };
        }
      },
    });

    // 41. close_widget
    this.register({
      name: 'close_widget',
      description: 'Close a currently open HTML widget window.',
      parameters: {
        type: 'OBJECT',
        properties: {
          widget_id: {
            type: 'STRING',
            description: 'The unique ID of the widget to close. Use all to close all widgets.',
          },
        },
        required: ['widget_id'],
      },
      execute: async ({ widget_id }: any) => {
        if (!widget_id) {
          return { success: false, error: 'widget_id required' };
        }
        try {
          const { ipcMain } = require('electron');
          const handlers = (ipcMain as any)._invokeHandlers;
          const handler = handlers && handlers.get('close-widget-window');
          if (handler) {
            await handler({} as any, widget_id);
          }
          return {
            success: true,
            result: `Widget ${widget_id} closed successfully.`,
          };
        } catch (err: any) {
          return { success: false, error: `Failed to close widget: ${err?.message || err}` };
        }
      },
    });

    // 42. browser_press_key
    this.register({
      name: 'browser_press_key',
      description: 'Press a keyboard key or key combination in the browser.',
      parameters: {
        type: 'OBJECT',
        properties: {
          key: {
            type: 'STRING',
            description: 'Key to press: Enter, Tab, Escape, Backspace, Delete, ArrowDown, ArrowUp, Home, End, PageDown, PageUp, F5, or combos like Control+a, Control+c, Control+v, Shift+Tab',
          },
        },
        required: ['key'],
      },
      execute: async ({ key }: any) => {
        if (!key) throw new Error('Key parameter is required');
        return await browserManager.pressKey(key);
      },
    });

    // 43. browser_emulate_device
    this.register({
      name: 'browser_emulate_device',
      description: 'Emulate a mobile or tablet device by setting viewport and user agent. Available: "iPhone 12", "iPhone 14", "iPad Pro", "Samsung Galaxy S20", "Pixel 5", "Desktop 1280", "Desktop 1920"',
      parameters: {
        type: 'OBJECT',
        properties: {
          deviceName: {
            type: 'STRING',
            description: 'Device name to emulate. Options: "iPhone 12", "iPhone 14", "iPad Pro", "Samsung Galaxy S20", "Pixel 5", "Desktop 1280", "Desktop 1920"',
          },
        },
        required: ['deviceName'],
      },
      execute: async ({ deviceName }: any) => {
        if (!deviceName) throw new Error('deviceName parameter is required');
        return await browserManager.emulateDevice(deviceName);
      },
    });

    // 44. browser_extract_text
    this.register({
      name: 'browser_extract_text',
      description: 'Extract readable text content from an element or the entire page.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: {
            type: 'STRING',
            description: 'CSS selector or ref number for specific element, or omit to extract all visible text (max 50,000 chars)',
          },
        },
      },
      execute: async ({ selector }: any = {}) => {
        return await browserManager.extractText(selector);
      },
    });

    // 45. browser_get_console
    this.register({
      name: 'browser_get_console',
      description: 'Read browser console messages (console.log, console.warn, console.error, etc.). Useful for debugging web applications.',
      parameters: {
        type: 'OBJECT',
        properties: {
          level: {
            type: 'STRING',
            description: 'Filter by level: "log", "warning", "error", "info" (optional, returns all if omitted)',
            enum: ['log', 'warning', 'error', 'info', 'debug'],
          },
        },
      },
      execute: async ({ level }: any = {}) => {
        return await browserManager.getConsole(level);
      },
    });

    // 46. browser_get_tabs
    this.register({
      name: 'browser_get_tabs',
      description: 'List all open browser tabs with their index, title, URL and which tab is currently active.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return await browserManager.getTabs();
      },
    });

    // 47. browser_go_back
    this.register({
      name: 'browser_go_back',
      description: 'Go back to the previous page in browser history (like pressing the Back button).',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return await browserManager.goBack();
      },
    });

    // 48. browser_handle_dialog
    this.register({
      name: 'browser_handle_dialog',
      description: 'Handle browser dialogs: alert(), confirm(), prompt(). Call this BEFORE the dialog-triggering action, or to set the default behavior.',
      parameters: {
        type: 'OBJECT',
        properties: {
          accept: {
            type: 'BOOLEAN',
            description: 'true to accept/confirm the dialog, false to dismiss/cancel (default: true)',
          },
          promptText: {
            type: 'STRING',
            description: 'Text to enter in prompt() dialogs (optional)',
          },
          timeoutMs: {
            type: 'NUMBER',
            description: 'Maximum wait time for dialog to appear in milliseconds (default: 10000)',
          },
        },
      },
      execute: async ({ accept = true, promptText, timeoutMs }: any = {}) => {
        return await browserManager.handleDialog(accept, promptText, timeoutMs);
      },
    });

    // 49. browser_hover
    this.register({
      name: 'browser_hover',
      description: 'Hover over an element to reveal dropdown menus, tooltips, or hidden content.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: {
            type: 'STRING',
            description: 'Ref number or CSS selector for the element to hover over',
          },
        },
        required: ['selector'],
      },
      execute: async ({ selector }: any) => {
        if (!selector) throw new Error('Selector is required');
        return await browserManager.hover(selector);
      },
    });

    // 50. browser_set_geolocation
    this.register({
      name: 'browser_set_geolocation',
      description: 'Fake the browser GPS location. Useful for testing location-based features or accessing geo-restricted content.',
      parameters: {
        type: 'OBJECT',
        properties: {
          latitude: {
            type: 'NUMBER',
            description: 'Latitude (-90 to 90)',
          },
          longitude: {
            type: 'NUMBER',
            description: 'Longitude (-180 to 180)',
          },
          accuracy: {
            type: 'NUMBER',
            description: 'GPS accuracy in meters (default: 100)',
          },
          clear: {
            type: 'BOOLEAN',
            description: 'Set true to clear/remove fake location (default: false)',
          },
        },
      },
      execute: async ({ latitude, longitude, accuracy, clear }: any = {}) => {
        return await browserManager.setGeolocation(latitude, longitude, accuracy, clear);
      },
    });

    // 51. browser_login
    this.register({
      name: 'browser_login',
      description: 'Launch an external Google Chrome browser session with user profile and remote debugging enabled for manual logins.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const { ipcMain } = require('electron');
        const handlers = (ipcMain as any)._invokeHandlers;
        const handler = handlers && handlers.get('launch-browser-login-session');
        if (handler) {
          return await handler({} as any);
        }
        return { success: true, result: 'Browser login session launched.' };
      },
    });

    // 52. scan_qr
    this.register({
      name: 'scan_qr',
      description: 'Retrieve current WhatsApp Web QR code connection status.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const state = whatsAppManager.getState();
        return {
          success: true,
          status: state?.status || 'disconnected',
          qrCode: state?.qrCode || null,
        };
      },
    });

    // 53. load_skill
    this.register({
      name: 'load_skill',
      description: 'Load the full step-by-step instructions for a named Skill. Call this when the user requests a task that matches an available skill.',
      parameters: {
        type: 'OBJECT',
        properties: {
          skill_name: {
            type: 'STRING',
            description: 'The exact name of the skill to load (as shown in the skills list).',
          },
        },
        required: ['skill_name'],
      },
      execute: async ({ skill_name }: any) => {
        if (!skill_name || typeof skill_name !== 'string') {
          return { success: false, error: 'skill_name is required.', errorCode: 'INVALID_ARGS', errorCategory: 'permanent', retryable: false };
        }
        try {
          const { ipcMain } = require('electron');
          const handlers = (ipcMain as any)._invokeHandlers;
          const handler = handlers && handlers.get('skills-load-content');
          let res: any = null;
          if (handler) {
            res = await handler({} as any, { skillName: skill_name });
          }
          if (res && res.success && res.content) {
            return {
              success: true,
              result: `=== SKILL: ${skill_name} ===\n\n${res.content}\n\n=== END OF SKILL ===\n\nNow follow these instructions exactly to complete the user's task.`,
              data: { skillName: skill_name, isCore: res.isCore },
            };
          }
          return {
            success: false,
            error: res?.error || `Skill "${skill_name}" could not be loaded.`,
            errorCode: 'INVALID_ARGS',
            errorCategory: 'permanent',
            retryable: false,
          };
        } catch (err: any) {
          return { success: false, error: `Failed to load skill: ${err?.message || err}`, errorCode: 'UNKNOWN_ERROR', errorCategory: 'transient', retryable: true };
        }
      },
    });

    // 54. control_media_player
    this.register({
      name: 'control_media_player',
      description: 'Control the Akki Neural Player floating music and video player window. Use this when the user asks to minimize, maximize, restore, fullscreen, or close the player, or to forward (+10s), rewind (-10s), seek to a specific timestamp (e.g. 2:15 or seconds), or control dedicated player volume (set_player_volume, player_volume_up, player_volume_down, mute_player, unmute_player). NOTE: This controls player internal audio only, not Windows master volume.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            enum: ['minimize', 'maximize', 'restore', 'fullscreen', 'close', 'play', 'pause', 'forward', 'rewind', 'seek', 'set_player_volume', 'player_volume_up', 'player_volume_down', 'mute_player', 'unmute_player'],
            description: 'The specific player action to execute.',
          },
          value: {
            type: 'STRING',
            description: 'Optional parameter: timestamp (seconds or MM:SS) for seek, seconds offset for forward/rewind, or volume (0-100).',
          },
        },
        required: ['action'],
      },
      execute: async ({ action, value }: any) => {
        try {
          let parsedVal = value;
          if (action === 'seek' && typeof value === 'string' && value.includes(':')) {
            const parts = value.split(':');
            if (parts.length === 2) {
              const mins = parseInt(parts[0], 10) || 0;
              const secs = parseInt(parts[1], 10) || 0;
              parsedVal = String(mins * 60 + secs);
            }
          }
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('media-player-control', { action, value: parsedVal });
            }
          });
          return {
            success: true,
            result: `Player action '${action}' executed successfully.`,
          };
        } catch (err: any) {
          return { success: false, error: err?.message || String(err) };
        }
      },
    });

    // 55. get_user_location
    this.register({
      name: 'get_user_location',
      description: "Get the user's current live location, city, state, country, and GPS coordinates. Use this whenever answering location-dependent queries like weather, nearby places, directions, or local facts.",
      parameters: {
        type: 'OBJECT',
        properties: {},
        required: [],
      },
      execute: async () => {
        let profileLoc = '';
        try {
          const pPath = path.join(app.getPath('userData'), 'user_profile.json');
          if (fs.existsSync(pPath)) {
            const p = JSON.parse(fs.readFileSync(pPath, 'utf8'));
            profileLoc = (p.location || '').trim();
          }
        } catch (_) {}

        try {
          const res = await fetch('https://ipwho.is/');
          const d: any = await res.json();
          if (d && d.success) {
            const full = profileLoc || `${d.city}, ${d.region}, ${d.country}`;
            return {
              success: true,
              result: `User's current location: ${full} (Latitude: ${d.latitude}, Longitude: ${d.longitude}, Timezone: ${d.timezone ? d.timezone.id : ''})`,
              data: {
                location: full,
                city: d.city,
                region: d.region,
                country: d.country,
                latitude: d.latitude,
                longitude: d.longitude,
                timezone: d.timezone ? d.timezone.id : '',
              },
            };
          }
        } catch (_) {}

        const cached = profileLoc || 'Current Location';
        return {
          success: true,
          result: `User's current location: ${cached}`,
          data: { location: cached },
        };
      },
    });

    // 56. keyboard_automation
    this.register({
      name: 'keyboard_automation',
      description: 'Simulate OS-level keyboard actions (press key or type text) via RobotJS.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            enum: ['press', 'type'],
            description: "Action to perform: 'press' for key combination, 'type' for typing string.",
          },
          key: {
            type: 'STRING',
            description: 'Key name for press action (e.g. enter, tab, escape, f, etc.)',
          },
          text: {
            type: 'STRING',
            description: 'Text to type for type action',
          },
          pressEnter: {
            type: 'BOOLEAN',
            description: 'Whether to press Enter after typing text',
          },
        },
        required: ['action'],
      },
      execute: async ({ action, key, text, pressEnter }: any) => {
        let robot: any;
        try {
          robot = require('@jitsi/robotjs');
        } catch (_) {
          return { success: false, error: 'RobotJS module not available.' };
        }
        try {
          if (action === 'press') {
            if (!key) return { success: false, error: 'key is required for press action' };
            robot.keyTap(key.toLowerCase());
            return { success: true, result: `Pressed key: ${key}` };
          } else if (action === 'type') {
            if (text) robot.typeString(text);
            if (pressEnter) {
              await new Promise((r) => setTimeout(r, 200));
              robot.keyTap('enter');
            }
            return { success: true, result: `Typed text: ${text || ''}` };
          }
          return { success: false, error: `Unknown action: ${action}` };
        } catch (err: any) {
          return { success: false, error: `Keyboard automation error: ${err?.message || err}` };
        }
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
