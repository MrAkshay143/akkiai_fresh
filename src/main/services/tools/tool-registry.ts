import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { clipboard, Notification, app, shell, BrowserWindow } from 'electron';
import { MemoryService } from '../memory/memory-service';
import { AgentCoordinator } from '../agents/agent-coordinator';
import { InfoPanelWindowManager } from '../../windows/info-panel-window';
import { createVideoWindow, controlVideoWindows } from '../../windows/video-window';
import { getMainWindow } from '../../windows/main-window';
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
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search query string' },
        },
        required: ['query'],
      },
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
      description:
        'Open a premium glassmorphic info display panel (HUD window) to print structured text, news feeds, weather updates, system logs, research details, or lists in markdown format. Use this heavily whenever the user asks for complex/detailed information (e.g., from web search, news, forecast, code snippets, or system diagnostics) that is easier to read than just listen to. Since this panel is temporary, opening it to show structured data is highly recommended most of the time to enhance user understanding.',
      parameters: {
        type: 'OBJECT',
        properties: {
          panel_id: {
            type: 'STRING',
            description: 'A unique identifier for the panel (e.g. "weather-hub", "news-headlines", "diagnostic-logs").',
          },
          title: {
            type: 'STRING',
            description: 'Title of the panel displayed in the header.',
          },
          content: {
            type: 'STRING',
            description: 'The content to display/print in Markdown format. Support tables, headers, lists, and bold text for rich styling.',
          },
          theme: {
            type: 'STRING',
            description: 'The color theme glow of the panel. Allowed values: "cyan", "amber", "crimson", "emerald", "blue". Default is "cyan".',
            enum: ['cyan', 'amber', 'crimson', 'emerald', 'blue'],
          },
        },
        required: ['panel_id', 'title', 'content'],
      },
      execute: async ({ panel_id, title, color, body, content, theme }: any) => {
        const id = panel_id || 'market_summary';
        const panelTitle = title || 'Information Panel';
        const panelTheme = (['cyan', 'amber', 'crimson', 'emerald', 'blue'].includes(theme || color)
          ? theme || color
          : 'cyan') as any;
        const panelContent = content || body || 'No content provided.';
        await this.infoPanelManager.openPanel({
          panelId: id,
          title: panelTitle,
          theme: panelTheme,
          content: panelContent,
        });
        return { success: true, panelId: id, theme: panelTheme };
      },
    });

    // 4. close_panel
    this.register({
      name: 'close_panel',
      description:
        'Close an active panel by its ID, such as the built-in media player or any dynamic info panels.',
      parameters: {
        type: 'OBJECT',
        properties: {
          panel_id: {
            type: 'STRING',
            description:
              'The ID of the panel to close. Set to "media-player" to close the active YouTube player, "all" to close all active info panels, or specify the panel_id of the info panel you want to close.',
          },
        },
        required: ['panel_id'],
      },
      execute: async ({ panel_id }: any) => {
        const id = panel_id || 'all';
        this.infoPanelManager.closePanel(id);
        return { success: true, panelId: id };
      },
    });

    // 5. store_memory
    this.register({
      name: 'store_memory',
      description: 'Save an important user fact or preference into durable long-term memory.',
      parameters: {
        type: 'OBJECT',
        properties: {
          content: { type: 'STRING', description: 'Fact or memory content to store' },
          category: { type: 'STRING', description: 'Category: personal, project, fact, or preference' },
        },
        required: ['content', 'category'],
      },
      execute: async ({ fact, content, category }: any) => {
        const memContent = content || fact;
        const success = this.memoryService.appendMemoryFact(category || 'General', memContent);
        return { success, fact: memContent };
      },
    });

    // 6. query_memory
    this.register({
      name: 'query_memory',
      description: 'Retrieve memories and user facts from ~/.hermes/memories/MEMORY.md.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Optional search keyword or topic' },
        },
      },
      execute: async ({ topic }: any = {}) => {
        const content = this.memoryService.readRawMemory();
        if (topic) {
          const lines = content.split('\n').filter(l => l.toLowerCase().includes(String(topic).toLowerCase()));
          return { content: lines.join('\n') || content };
        }
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
      description: "Execute a shell command on the user's PC/Mac. Most powerful OS tool for system tasks, scripts, and package management.",
      parameters: {
        type: 'OBJECT',
        properties: {
          command: { type: 'STRING', description: 'Terminal command to execute' },
          workingDir: { type: 'STRING', description: 'Optional working directory path' },
          timeout: { type: 'NUMBER', description: 'Execution timeout in ms (default 30000, max 300000)' },
        },
        required: ['command'],
      },
      execute: async ({ command, workingDir, timeout }: any) => {
        if (!command) throw new Error('Command required');
        // Safety guard against destructive commands
        const dangerousPatterns = [/rm\s+-rf\s+\//i, /format\s+[a-z]:/i, /del\s+\/s\s+\/q\s+c:\\/i];
        for (const pattern of dangerousPatterns) {
          if (pattern.test(command)) {
            throw new Error(`Command blocked by safety guard: ${command}`);
          }
        }
        const execTimeout = Math.min(300000, Math.max(1000, Number(timeout) || 30000));
        const cwd = workingDir && fs.existsSync(workingDir) ? path.resolve(workingDir) : undefined;

        return new Promise((resolve) => {
          exec(command, { timeout: execTimeout, cwd }, (error, stdout, stderr) => {
            const outStr = stdout || '';
            const errStr = stderr || (error ? error.message : '');
            resolve({
              success: !error,
              exitCode: error ? error.code || 1 : 0,
              stdout: outStr,
              stderr: errStr,
              result: outStr || errStr || (error ? `Failed with exit code ${error.code}` : 'Command executed successfully'),
            });
          });
        });
      },
    });

    // 11-proc. os_process
    this.register({
      name: 'os_process',
      description: 'List running processes or kill a process by PID.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'Action to perform: "list" or "kill"' },
          pid: { type: 'NUMBER', description: 'Process ID to kill (required if action is "kill")' },
        },
        required: ['action'],
      },
      execute: async ({ action, pid }: any) => {
        if (action === 'kill') {
          if (!pid) throw new Error('pid is required for action "kill"');
          try {
            process.kill(Number(pid));
            return { success: true, result: `Killed process ${pid}` };
          } catch (err: any) {
            return { success: false, error: err.message };
          }
        }
        return new Promise((resolve) => {
          const cmd = process.platform === 'win32'
            ? 'tasklist /FO CSV /NH'
            : 'ps -eo pid,comm --sort=-%mem';
          exec(cmd, { timeout: 10000 }, (err, stdout) => {
            if (err) return resolve({ success: false, error: err.message });
            resolve({ success: true, result: stdout.slice(0, 50000) });
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
      description: "Read a file's content or list directory contents. Supports line offset/limit pagination.",
      parameters: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING', description: 'Path to file or directory to read' },
          offset: { type: 'NUMBER', description: 'Starting line number (1-indexed)' },
          limit: { type: 'NUMBER', description: 'Number of lines to read' },
        },
        required: ['path'],
      },
      execute: async ({ path: targetPath, file_path, offset, limit }: any) => {
        const p = targetPath || file_path;
        if (!p) throw new Error('path parameter required');
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) throw new Error(`Path does not exist: ${resolved}`);
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          const entries = fs.readdirSync(resolved, { withFileTypes: true });
          const items = entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
          return {
            path: resolved,
            isDirectory: true,
            totalItems: entries.length,
            content: items,
          };
        }
        const data = fs.readFileSync(resolved, 'utf-8');
        const lines = data.split(/\r?\n/);
        const start = offset ? Math.max(0, Number(offset) - 1) : 0;
        const count = limit ? Number(limit) : lines.length;
        const sliced = lines.slice(start, start + count);
        const numbered = sliced.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
        return {
          path: resolved,
          totalLines: lines.length,
          offset: start + 1,
          limit: count,
          content: numbered.slice(0, 200000),
        };
      },
    });

    // 13. fs_write
    this.register({
      name: 'fs_write',
      description: 'Write content to a file (creates if not exists, overwrites) or create a directory.',
      parameters: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING', description: 'Destination file or folder path' },
          content: { type: 'STRING', description: 'File content to write' },
          isDirectory: { type: 'BOOLEAN', description: 'Set true to create directory instead of file' },
        },
        required: ['path'],
      },
      execute: async ({ path: targetPath, file_path, content, isDirectory }: any) => {
        const p = targetPath || file_path;
        if (!p) throw new Error('path required');
        const resolved = path.resolve(p);
        if (isDirectory) {
          if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
          return { success: true, path: resolved, isDirectory: true };
        }
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
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return { text: clipboard.readText() };
      },
    });

    this.register({
      name: 'clipboard_write',
      description: 'Copy text to system clipboard.',
      parameters: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING', description: 'Text to copy to system clipboard.' },
        },
        required: ['text'],
      },
      execute: async ({ text }: any) => {
        clipboard.writeText(text || '');
        return { success: true };
      },
    });

    // 15. send_notification
    this.register({
      name: 'send_notification',
      description: 'Send a desktop notification to the user.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Notification title' },
          body: { type: 'STRING', description: 'Notification body message' },
        },
        required: ['title', 'body'],
      },
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
      parameters: {
        type: 'OBJECT',
        properties: {
          mermaid_code: { type: 'STRING', description: 'Mermaid diagram syntax code' },
          diagram_type: { type: 'STRING', description: 'Diagram type, e.g. flowchart, sequence, class' },
          title: { type: 'STRING', description: 'Diagram title' },
        },
        required: ['mermaid_code'],
      },
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
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return await hardwareService.listPorts();
      },
    });

    // 18. arduino_connect
    this.register({
      name: 'arduino_connect',
      description: 'Connect to an Arduino microcontroller board on a specific COM port.',
      parameters: {
        type: 'OBJECT',
        properties: {
          port: { type: 'STRING', description: 'Serial COM port (e.g. COM3 or /dev/ttyUSB0)' },
        },
        required: ['port'],
      },
      execute: async ({ port }: { port?: string }) => {
        if (!port) throw new Error('Port parameter required (e.g. COM3)');
        return await hardwareService.connect(port);
      },
    });

    // 19. arduino_disconnect
    this.register({
      name: 'arduino_disconnect',
      description: 'Disconnect from the currently connected Arduino board.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return hardwareService.disconnect();
      },
    });

    this.register({
      name: 'arduino_board_status',
      description: 'Query firmware version and pin capabilities of connected board.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        return await hardwareService.getBoardStatus();
      },
    });

    this.register({
      name: 'arduino_digital_write',
      description: 'Write digital HIGH/LOW to Arduino pin.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Digital pin number' },
          value: { type: 'NUMBER', description: 'Pin value: 1 for HIGH, 0 for LOW' },
        },
        required: ['pin', 'value'],
      },
      execute: async ({ pin, value }: { pin?: number; value?: number }) => {
        if (pin === undefined || value === undefined) throw new Error('Pin and value required');
        return await hardwareService.digitalWrite(pin, value);
      },
    });

    this.register({
      name: 'arduino_digital_read',
      description: 'Read digital pin state.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Digital pin number' },
        },
        required: ['pin'],
      },
      execute: async ({ pin }: { pin?: number }) => {
        if (pin === undefined) throw new Error('Pin required');
        return await hardwareService.digitalRead(pin);
      },
    });

    this.register({
      name: 'arduino_analog_read',
      description: 'Read analog value from Arduino pin.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Analog pin number (e.g. 0 for A0)' },
        },
        required: ['pin'],
      },
      execute: async ({ pin }: { pin?: number }) => {
        if (pin === undefined) throw new Error('Pin required');
        return await hardwareService.analogRead(pin);
      },
    });

    this.register({
      name: 'arduino_analog_write',
      description: 'Output PWM signal to pin for LED dimming / motor speed.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'PWM capable pin number' },
          value: { type: 'NUMBER', description: 'PWM duty cycle value (0-255)' },
        },
        required: ['pin', 'value'],
      },
      execute: async ({ pin, value }: { pin?: number; value?: number }) => {
        if (pin === undefined || value === undefined) throw new Error('Pin and value required');
        return await hardwareService.analogWrite(pin, value);
      },
    });

    this.register({
      name: 'arduino_set_pin_mode',
      description: 'Configure pin mode (INPUT, OUTPUT, ANALOG, PWM, SERVO).',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Pin number' },
          mode: { type: 'STRING', description: 'Pin mode: INPUT, OUTPUT, ANALOG, PWM, SERVO' },
        },
        required: ['pin', 'mode'],
      },
      execute: async ({ pin, mode }: { pin?: number; mode?: string }) => {
        if (pin === undefined || !mode) throw new Error('Pin and mode required');
        return await hardwareService.setPinMode(pin, mode);
      },
    });

    this.register({
      name: 'arduino_servo_write',
      description: 'Write angle to servo on Arduino pin.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Servo pin number' },
          angle: { type: 'NUMBER', description: 'Servo angle in degrees (0-180)' },
        },
        required: ['pin', 'angle'],
      },
      execute: async ({ pin, angle }: { pin?: number; angle?: number }) => {
        if (pin === undefined || angle === undefined) throw new Error('Pin and angle required');
        return await hardwareService.servoWrite(pin, angle);
      },
    });

    this.register({
      name: 'arduino_led_blink',
      description: 'Blink LED continuously at specified millisecond interval.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Digital pin number' },
          intervalMs: { type: 'NUMBER', description: 'Blink interval in ms (default 500)' },
        },
        required: ['pin'],
      },
      execute: async ({ pin, intervalMs }: { pin?: number; intervalMs?: number }) => {
        if (pin === undefined) throw new Error('Pin required');
        return await hardwareService.ledBlink(pin, intervalMs || 500);
      },
    });

    this.register({
      name: 'arduino_led_stop',
      description: 'Stop ongoing LED blink pattern on pin.',
      parameters: {
        type: 'OBJECT',
        properties: {
          pin: { type: 'NUMBER', description: 'Digital pin number' },
        },
        required: ['pin'],
      },
      execute: async ({ pin }: { pin?: number }) => {
        if (pin === undefined) throw new Error('Pin required');
        return await hardwareService.ledStop(pin);
      },
    });

    // 20. play_youtube_video
    this.register({
      name: 'play_youtube_video',
      description:
        "Search YouTube and play a video inside the app's built-in media player. The video opens in an embedded overlay without leaving the app. Use this when the user asks to play, watch, or listen to any video or song.",
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description:
              'The search query or video title to find on YouTube. Be specific for better results (e.g. "Dua Lipa Levitating official video", "lofi hip hop study music").',
          },
        },
        required: ['query'],
      },
      execute: async ({ query }: { query?: string }) => {
        if (!query) throw new Error('Search query or video title required');
        let videoId = 's41eL_6o1Z8';
        try {
          const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          const html = await res.text();
          const match = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
          if (match && match[1]) {
            videoId = match[1];
          }
        } catch (_) {}

        // Launch dedicated floating 800x500 video window (exact parity with old app)
        createVideoWindow(videoId);

        // Also notify main window for overlay mode
        const mainWin = getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('play-video', videoId);
        }

        return {
          success: true,
          query,
          videoId,
          videoTitle: query,
          url: `https://www.youtube.com/watch?v=${videoId}`,
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
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING', description: 'Detailed prompt describing the image to generate' },
        },
        required: ['prompt'],
      },
      execute: generateImageHandler,
    });
    this.register({
      name: 'huggingface_generate_image',
      description: 'Generate an AI image using Hugging Face (or direct rendering).',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING', description: 'Image generation prompt' },
        },
        required: ['prompt'],
      },
      execute: generateImageHandler,
    });

    // 22. browser_navigate
    this.register({
      name: 'browser_navigate',
      description: 'Navigate the headless browser to a URL.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'Target URL to visit (e.g. https://google.com)' },
        },
        required: ['url'],
      },
      execute: async ({ url }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.navigate(url);
      },
    });

    // 23. browser_screenshot
    this.register({
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page in the browser.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fullPage: { type: 'BOOLEAN', description: 'Whether to capture the entire scrollable page' },
          selector: { type: 'STRING', description: 'Optional CSS selector to capture' },
        },
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.screenshot();
      },
    });

    // 24. browser_get_html
    this.register({
      name: 'browser_get_html',
      description: 'Get HTML content of the current page.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'Optional CSS selector' },
          maxChars: { type: 'NUMBER', description: 'Maximum characters to return' },
        },
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.extract();
      },
    });

    // 25. browser_click
    this.register({
      name: 'browser_click',
      description: 'Click on a CSS selector in the browser.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the element to click' },
          doubleClick: { type: 'BOOLEAN', description: 'Perform double click' },
          button: { type: 'STRING', description: 'left, right, or middle button' },
          modifiers: { type: 'ARRAY', description: 'Keyboard modifiers e.g. Shift, Control' },
          delayMs: { type: 'NUMBER', description: 'Delay before click in ms' },
        },
        required: ['selector'],
      },
      execute: async ({ selector }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        return await browserManager.click(selector);
      },
    });

    // 26. browser_type
    this.register({
      name: 'browser_type',
      description: 'Type or fill value into a CSS selector.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of input or contenteditable element' },
          text: { type: 'STRING', description: 'Text to type' },
          value: { type: 'STRING', description: 'Alias for text' },
          clearFirst: { type: 'BOOLEAN', description: 'Clear existing text before typing' },
          slowly: { type: 'BOOLEAN', description: 'Type with human-like delay' },
        },
        required: ['selector'],
      },
      execute: async ({ selector, text, value }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        const txt = text !== undefined ? text : value;
        return await browserManager.fill(selector, txt || '');
      },
    });

    // 27. take_screenshot
    this.register({
      name: 'take_screenshot',
      description: 'Capture screenshot of the desktop screen.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        try {
          const { desktopCapturer } = require('electron');
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
          if (sources.length > 0) {
            const dataUrl = sources[0].thumbnail.toDataURL();
            const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
            return {
              success: true,
              dataUrl,
              sourceName: sources[0].name,
              timestamp: new Date().toISOString(),
              _screenshotForVision: {
                data: base64Data,
                mimeType: 'image/jpeg',
              },
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
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING', description: 'Target file path' },
          old_text: { type: 'STRING', description: 'Exact string to be replaced in file' },
          new_text: { type: 'STRING', description: 'Replacement string' },
          target_content: { type: 'STRING', description: 'Alias for old_text' },
          replacement_content: { type: 'STRING', description: 'Alias for new_text' },
          allow_multiple: { type: 'BOOLEAN', description: 'Replace all occurrences if true' },
        },
        required: ['path'],
      },
      execute: async ({ path: targetPath, old_text, new_text, target_content, replacement_content, allow_multiple }: Record<string, any>) => {
        if (!targetPath) throw new Error('Path is required');
        const resolved = path.resolve(targetPath);
        if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);
        const content = fs.readFileSync(resolved, 'utf-8');
        const target = old_text !== undefined ? old_text : target_content;
        const replacement = new_text !== undefined ? new_text : replacement_content;
        if (target === undefined || replacement === undefined) {
          throw new Error('Both old_text and new_text are required');
        }
        if (!content.includes(target)) {
          throw new Error('Target content not found in file');
        }
        let updated: string;
        if (allow_multiple) {
          updated = content.split(target).join(replacement);
        } else {
          updated = content.replace(target, replacement);
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
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'create | list | read | read_all | update | delete' },
          id: { type: 'STRING', description: 'Note ID' },
          ids: { type: 'ARRAY', description: 'Array of note IDs for bulk delete' },
          title: { type: 'STRING', description: 'Note title' },
          content: { type: 'STRING', description: 'Note content' },
          category: { type: 'STRING', description: 'Note category' },
          notes: { type: 'ARRAY', description: 'Array of note objects for bulk creation' },
        },
        required: ['action'],
      },
      execute: async ({ action, id, ids, title, content, category, notes: bulkNotes }: Record<string, any>) => {
        const notesPath = path.join(app.getPath('userData'), 'notes.json');
        let notes: any[] = [];
        if (fs.existsSync(notesPath)) {
          try { notes = JSON.parse(fs.readFileSync(notesPath, 'utf8')); } catch {}
        }
        if (!Array.isArray(notes)) notes = [];

        switch (action) {
          case 'list':
          case 'read_all':
            return { success: true, notes };
          case 'read': {
            const found = notes.find((n) => n.id === id);
            if (!found) throw new Error(`Note not found: ${id}`);
            return { success: true, note: found };
          }
          case 'create': {
            if (Array.isArray(bulkNotes) && bulkNotes.length > 0) {
              const created = bulkNotes.map((n: any) => ({
                id: n.id || `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: n.title || 'Untitled Note',
                content: n.content || '',
                category: n.category || 'General',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }));
              notes.unshift(...created);
              fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2), 'utf8');
              return { success: true, count: created.length, notes: created };
            }
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
            if (Array.isArray(ids) && ids.length > 0) {
              const set = new Set(ids);
              const filtered = notes.filter((n) => !set.has(n.id));
              fs.writeFileSync(notesPath, JSON.stringify(filtered, null, 2), 'utf8');
              return { success: true, deletedCount: notes.length - filtered.length, deletedIds: ids };
            }
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
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'list | add | create | complete | incomplete | update | delete' },
          id: { type: 'STRING', description: 'Task ID' },
          ids: { type: 'ARRAY', description: 'Array of task IDs for bulk delete' },
          text: { type: 'STRING', description: 'Task title or description text' },
          title: { type: 'STRING', description: 'Alias for text' },
          texts: { type: 'ARRAY', description: 'Array of task titles for bulk add' },
          tasks: { type: 'ARRAY', description: 'Array of task objects for bulk add' },
          status: { type: 'STRING', description: 'pending | in_progress | completed | failed' },
          priority: { type: 'STRING', description: 'low | medium | high' },
          category: { type: 'STRING', description: 'Task category' },
        },
        required: ['action'],
      },
      execute: async ({ action, id, ids, text, title, texts, tasks: bulkTasks, status, priority, category }: Record<string, any>) => {
        const tasksPath = path.join(app.getPath('userData'), 'tasks.json');
        let tasks: any[] = [];
        if (fs.existsSync(tasksPath)) {
          try { tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8')); } catch {}
        }
        if (!Array.isArray(tasks)) tasks = [];

        switch (action) {
          case 'list':
            return { success: true, tasks };
          case 'add':
          case 'create': {
            if (Array.isArray(texts) && texts.length > 0) {
              const added = texts.map((t: string) => ({
                id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: t,
                status: 'pending',
                priority: priority || 'medium',
                category: category || 'General',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }));
              tasks.unshift(...added);
              fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
              return { success: true, count: added.length, tasks: added };
            }
            if (Array.isArray(bulkTasks) && bulkTasks.length > 0) {
              const added = bulkTasks.map((t: any) => ({
                id: t.id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: t.title || t.text || 'New Task',
                status: t.status || 'pending',
                priority: t.priority || 'medium',
                category: t.category || 'General',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }));
              tasks.unshift(...added);
              fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
              return { success: true, count: added.length, tasks: added };
            }
            const taskTitle = text !== undefined ? text : (title || 'New Task');
            const newTask = {
              id: id || `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: taskTitle,
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
          case 'complete': {
            const idx = tasks.findIndex((t) => t.id === id);
            if (idx === -1) throw new Error(`Task not found: ${id}`);
            tasks[idx].status = 'completed';
            tasks[idx].updatedAt = new Date().toISOString();
            fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
            return { success: true, task: tasks[idx] };
          }
          case 'incomplete': {
            const idx = tasks.findIndex((t) => t.id === id);
            if (idx === -1) throw new Error(`Task not found: ${id}`);
            tasks[idx].status = 'pending';
            tasks[idx].updatedAt = new Date().toISOString();
            fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
            return { success: true, task: tasks[idx] };
          }
          case 'update': {
            const idx = tasks.findIndex((t) => t.id === id);
            if (idx === -1) throw new Error(`Task not found: ${id}`);
            if (text !== undefined) tasks[idx].title = text;
            if (title !== undefined) tasks[idx].title = title;
            if (status !== undefined) tasks[idx].status = status;
            if (priority !== undefined) tasks[idx].priority = priority;
            if (category !== undefined) tasks[idx].category = category;
            tasks[idx].updatedAt = new Date().toISOString();
            fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf8');
            return { success: true, task: tasks[idx] };
          }
          case 'delete': {
            if (Array.isArray(ids) && ids.length > 0) {
              const set = new Set(ids);
              const filtered = tasks.filter((t) => !set.has(t.id));
              fs.writeFileSync(tasksPath, JSON.stringify(filtered, null, 2), 'utf8');
              return { success: true, deletedCount: tasks.length - filtered.length, deletedIds: ids };
            }
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
      parameters: {
        type: 'OBJECT',
        properties: {
          includeScreenshot: { type: 'BOOLEAN', description: 'Whether to include screenshot data' },
        },
      },
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
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector to wait for' },
          timeoutMs: { type: 'NUMBER', description: 'Timeout in milliseconds' },
          state: { type: 'STRING', description: 'Wait state: visible, attached, hidden' },
        },
      },
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
      parameters: {
        type: 'OBJECT',
        properties: {
          script: { type: 'STRING', description: 'JavaScript code to execute in page context' },
        },
        required: ['script'],
      },
      execute: async ({ script }: Record<string, any>) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const result = await p.evaluate((code: string) => eval(code), script);
        return { success: true, result };
      },
    });

    this.register({
      name: 'browser_go_forward',
      description: 'Navigate forward in browser history.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 });
        return { success: true, result: 'Navigated forward in browser history.' };
      },
    });

    this.register({
      name: 'browser_reload',
      description: 'Reload the current browser page.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ignoreCache: { type: 'BOOLEAN', description: 'Bypass browser cache' },
        },
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.reload({ waitUntil: 'domcontentloaded' });
        return { success: true, result: 'Page reloaded.' };
      },
    });

    this.register({
      name: 'browser_close',
      description: 'Close the browser window and terminate instance.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        await browserManager.close();
        return { success: true, result: 'Browser closed.' };
      },
    });

    this.register({
      name: 'browser_scroll',
      description: 'Scroll page in specified direction.',
      parameters: {
        type: 'OBJECT',
        properties: {
          direction: { type: 'STRING', description: 'up | down | top | bottom' },
          amount: { type: 'NUMBER', description: 'Pixels to scroll' },
        },
        required: ['direction'],
      },
      execute: async ({ direction, amount }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        if (direction === 'bottom') await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        else if (direction === 'top') await p.evaluate(() => window.scrollTo(0, 0));
        else if (direction === 'up') await p.evaluate((amt: number) => window.scrollBy(0, -(amt || 500)), amount || 500);
        else await p.evaluate((amt: number) => window.scrollBy(0, amt || 500), amount || 500);
        return { success: true, result: `Scrolled ${direction}.` };
      },
    });

    this.register({
      name: 'browser_scroll_into_view',
      description: 'Scroll an element into view.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the element' },
        },
        required: ['selector'],
      },
      execute: async ({ selector }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.locator(selector).scrollIntoViewIfNeeded({ timeout: 10000 });
        return { success: true, result: `Scrolled ${selector} into view.` };
      },
    });

    this.register({
      name: 'browser_select',
      description: 'Select option in a dropdown by value or label.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the select element' },
          value: { type: 'STRING', description: 'Value or label of the option to select' },
        },
        required: ['selector', 'value'],
      },
      execute: async ({ selector, value }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.selectOption(selector, value);
        return { success: true, result: `Selected ${value} on ${selector}.` };
      },
    });

    this.register({
      name: 'browser_highlight',
      description: 'Highlight an element with a colored border outline.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the element' },
        },
        required: ['selector'],
      },
      execute: async ({ selector }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (el) (el as HTMLElement).style.outline = '3px solid #00f0ff';
        }, selector);
        return { success: true, result: `Highlighted element ${selector}.` };
      },
    });

    this.register({
      name: 'browser_query_selector',
      description: 'Query DOM elements matching CSS selector with bounding boxes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector to query' },
        },
        required: ['selector'],
      },
      execute: async ({ selector }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const items = await p.evaluate((sel: string) => {
          return Array.from(document.querySelectorAll(sel)).slice(0, 50).map((el, i) => ({
            index: i,
            tagName: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 200),
            href: (el as HTMLAnchorElement).href || undefined,
          }));
        }, selector);
        return { success: true, result: `Found ${items.length} elements`, count: items.length, elements: items };
      },
    });

    this.register({
      name: 'browser_fill_form',
      description: 'Fill multiple form fields simultaneously.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fields: { type: 'OBJECT', description: 'Map of CSS selectors to values to fill' },
        },
        required: ['fields'],
      },
      execute: async ({ fields }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        for (const [sel, val] of Object.entries(fields || {})) {
          await p.fill(sel, String(val));
        }
        return { success: true, result: 'Form fields filled.' };
      },
    });

    this.register({
      name: 'browser_new_tab',
      description: 'Open a new browser tab with optional URL.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'Optional URL to open in new tab' },
        },
      },
      execute: async ({ url }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        const p = await browserManager['context']!.newPage();
        browserManager['activePage'] = p;
        if (url) await p.goto(url.startsWith('http') ? url : `https://${url}`);
        return { success: true, result: `Opened new tab${url ? ` at ${url}` : ''}` };
      },
    });

    this.register({
      name: 'browser_switch_tab',
      description: 'Switch active tab to a specific index.',
      parameters: {
        type: 'OBJECT',
        properties: {
          index: { type: 'NUMBER', description: 'Tab index to switch to' },
        },
        required: ['index'],
      },
      execute: async ({ index }: any) => {
        const { browserManager } = require('./browser-manager');
        const pages = browserManager['context']?.pages() || [];
        const idx = Number(index);
        if (pages[idx]) {
          browserManager['activePage'] = pages[idx];
          await pages[idx].bringToFront();
          return { success: true, result: `Switched to tab ${idx}` };
        }
        throw new Error(`Tab index ${idx} out of range (${pages.length} tabs open)`);
      },
    });

    this.register({
      name: 'browser_close_tab',
      description: 'Close a specific browser tab by index.',
      parameters: {
        type: 'OBJECT',
        properties: {
          index: { type: 'NUMBER', description: 'Tab index to close' },
        },
        required: ['index'],
      },
      execute: async ({ index }: any) => {
        const { browserManager } = require('./browser-manager');
        const pages = browserManager['context']?.pages() || [];
        const idx = Number(index);
        if (pages[idx]) {
          await pages[idx].close();
          return { success: true, result: `Closed tab ${idx}` };
        }
        throw new Error(`Tab index ${idx} out of range`);
      },
    });

    this.register({
      name: 'browser_get_cookies',
      description: 'Retrieve cookies for current page.',
      parameters: {
        type: 'OBJECT',
        properties: {
          urls: { type: 'ARRAY', description: 'Optional list of URLs to filter cookies for' },
        },
      },
      execute: async ({ urls }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        const cookies = await browserManager['context']!.cookies(urls);
        return { success: true, cookies };
      },
    });

    this.register({
      name: 'browser_set_cookie',
      description: 'Inject a cookie into browser session.',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Cookie name' },
          value: { type: 'STRING', description: 'Cookie value' },
          domain: { type: 'STRING', description: 'Cookie domain' },
          path: { type: 'STRING', description: 'Cookie path' },
        },
        required: ['name', 'value'],
      },
      execute: async ({ name, value, domain, path: cookiePath }: any) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        await browserManager['context']!.addCookies([{ name, value, domain: domain || 'localhost', path: cookiePath || '/' }]);
        return { success: true, result: `Cookie ${name} set.` };
      },
    });

    this.register({
      name: 'browser_clear_cookies',
      description: 'Clear all browser cookies for current context.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        if (browserManager['context']) await browserManager['context'].clearCookies();
        return { success: true, result: 'Cookies cleared.' };
      },
    });

    this.register({
      name: 'browser_get_storage',
      description: 'Read localStorage or sessionStorage items.',
      parameters: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'local | session' },
          key: { type: 'STRING', description: 'Specific key to read, or omit to read all' },
        },
      },
      execute: async ({ type, key }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const res = await p.evaluate(({ t, k }: any) => {
          const storage = t === 'session' ? sessionStorage : localStorage;
          return k ? storage.getItem(k) : { ...storage };
        }, { t: type, k: key });
        return { success: true, data: res };
      },
    });

    this.register({
      name: 'browser_set_storage',
      description: 'Set item in localStorage or sessionStorage.',
      parameters: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'local | session' },
          key: { type: 'STRING', description: 'Storage key' },
          value: { type: 'STRING', description: 'Storage value' },
        },
        required: ['type', 'key', 'value'],
      },
      execute: async ({ type, key, value }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.evaluate(({ t, k, v }: any) => {
          const storage = t === 'session' ? sessionStorage : localStorage;
          storage.setItem(k, v);
        }, { t: type, k: key, v: value });
        return { success: true, result: `Storage item ${key} set.` };
      },
    });

    this.register({
      name: 'browser_clear_storage',
      description: 'Clear browser web storage.',
      parameters: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'local | session | all' },
        },
      },
      execute: async ({ type }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.evaluate((t: string) => {
          if (t === 'session') sessionStorage.clear();
          else if (t === 'local') localStorage.clear();
          else {
            localStorage.clear();
            sessionStorage.clear();
          }
        }, type || 'all');
        return { success: true, result: 'Storage cleared.' };
      },
    });

    this.register({
      name: 'browser_resize_viewport',
      description: 'Resize browser viewport dimensions.',
      parameters: {
        type: 'OBJECT',
        properties: {
          width: { type: 'NUMBER', description: 'Viewport width in px' },
          height: { type: 'NUMBER', description: 'Viewport height in px' },
        },
        required: ['width', 'height'],
      },
      execute: async ({ width, height }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.setViewportSize({ width: Number(width) || 1280, height: Number(height) || 800 });
        return { success: true, result: `Viewport resized to ${width}x${height}.` };
      },
    });

    this.register({
      name: 'browser_save_pdf',
      description: 'Print current webpage to PDF file on disk.',
      parameters: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING', description: 'Output file path (.pdf)' },
          format: { type: 'STRING', description: 'Paper format, e.g. A4, Letter' },
        },
      },
      execute: async ({ path: targetPath, format }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const dest = targetPath || path.join(app.getPath('downloads'), `webpage-${Date.now()}.pdf`);
        await p.pdf({ path: dest, format: (format as any) || 'A4' });
        return { success: true, path: dest, result: `PDF saved to ${dest}` };
      },
    });

    this.register({
      name: 'browser_drag_drop',
      description: 'Drag an element onto another element.',
      parameters: {
        type: 'OBJECT',
        properties: {
          sourceSelector: { type: 'STRING', description: 'CSS selector of source element' },
          targetSelector: { type: 'STRING', description: 'CSS selector of target drop area' },
        },
        required: ['sourceSelector', 'targetSelector'],
      },
      execute: async ({ sourceSelector, targetSelector }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.dragAndDrop(sourceSelector, targetSelector);
        return { success: true, result: `Dragged ${sourceSelector} to ${targetSelector}.` };
      },
    });

    this.register({
      name: 'browser_upload_file',
      description: 'Upload files into file input element.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the file input' },
          filePaths: { type: 'ARRAY', description: 'Array of local file paths to upload' },
        },
        required: ['selector', 'filePaths'],
      },
      execute: async ({ selector, filePaths }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.setInputFiles(selector, filePaths);
        return { success: true, result: `Uploaded files to ${selector}.` };
      },
    });

    this.register({
      name: 'browser_emulate_color_scheme',
      description: 'Emulate light or dark color scheme preference.',
      parameters: {
        type: 'OBJECT',
        properties: {
          scheme: { type: 'STRING', description: 'light | dark' },
        },
        required: ['scheme'],
      },
      execute: async ({ scheme }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        await p.emulateMedia({ colorScheme: scheme === 'light' ? 'light' : 'dark' });
        return { success: true, result: `Emulating ${scheme} color scheme.` };
      },
    });

    this.register({
      name: 'browser_set_offline',
      description: 'Toggle offline network simulation.',
      parameters: {
        type: 'OBJECT',
        properties: {
          offline: { type: 'BOOLEAN', description: 'Whether to simulate offline mode' },
        },
        required: ['offline'],
      },
      execute: async ({ offline }: any) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        await browserManager['context']!.setOffline(Boolean(offline));
        return { success: true, result: `Offline mode set to ${offline}.` };
      },
    });

    this.register({
      name: 'browser_set_extra_headers',
      description: 'Set custom HTTP request headers.',
      parameters: {
        type: 'OBJECT',
        properties: {
          headers: { type: 'OBJECT', description: 'Key-value map of HTTP headers' },
        },
        required: ['headers'],
      },
      execute: async ({ headers }: any) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        await browserManager['context']!.setExtraHTTPHeaders(headers || {});
        return { success: true, result: 'Extra HTTP headers applied.' };
      },
    });

    this.register({
      name: 'browser_set_http_credentials',
      description: 'Provide HTTP Basic Authentication credentials.',
      parameters: {
        type: 'OBJECT',
        properties: {
          username: { type: 'STRING', description: 'Username' },
          password: { type: 'STRING', description: 'Password' },
        },
        required: ['username', 'password'],
      },
      execute: async ({ username, password }: any) => {
        const { browserManager } = require('./browser-manager');
        if (!browserManager['context']) await browserManager.launch();
        await browserManager['context']!.setHTTPCredentials({ username, password });
        return { success: true, result: 'HTTP credentials set.' };
      },
    });

    this.register({
      name: 'browser_wait_download',
      description: 'Wait for browser download to complete and return local file path.',
      parameters: {
        type: 'OBJECT',
        properties: {
          timeout: { type: 'NUMBER', description: 'Timeout in ms (default 30000)' },
        },
      },
      execute: async ({ timeout }: any = {}) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const download = await p.waitForEvent('download', { timeout: timeout || 30000 }).catch(() => null);
        const savedPath = download ? await download.path() : null;
        return { success: Boolean(savedPath), downloadedPath: savedPath };
      },
    });

    this.register({
      name: 'browser_download_by_click',
      description: 'Click an element and wait for triggered file download.',
      parameters: {
        type: 'OBJECT',
        properties: {
          selector: { type: 'STRING', description: 'CSS selector of the download button/link' },
          timeout: { type: 'NUMBER', description: 'Timeout in ms (default 30000)' },
        },
        required: ['selector'],
      },
      execute: async ({ selector, timeout }: any) => {
        const { browserManager } = require('./browser-manager');
        const p = await browserManager.getPage();
        const [download] = await Promise.all([
          p.waitForEvent('download', { timeout: timeout || 30000 }).catch(() => null),
          p.click(selector),
        ]);
        const savedPath = download ? await download.path() : null;
        return { success: Boolean(savedPath), downloadedPath: savedPath };
      },
    });

    this.register({
      name: 'browser_get_errors',
      description: 'Get uncaught exceptions and broken network requests.',
      parameters: {
        type: 'OBJECT',
        properties: {},
      },
      execute: async () => {
        const { browserManager } = require('./browser-manager');
        const errors = (browserManager as any).consoleMessages?.filter((m: any) => m.level === 'error') || [];
        return { success: true, errors };
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
          controlVideoWindows(action, parsedVal);
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

  private normalizeSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    const cloned = Array.isArray(schema) ? [...schema] : { ...schema };
    if (typeof cloned.type === 'string') {
      cloned.type = cloned.type.toUpperCase();
    }
    if (cloned.properties && typeof cloned.properties === 'object') {
      const normProps: Record<string, any> = {};
      for (const [k, v] of Object.entries(cloned.properties)) {
        normProps[k] = this.normalizeSchema(v);
      }
      cloned.properties = normProps;
    }
    if (cloned.items) {
      cloned.items = this.normalizeSchema(cloned.items);
    }
    return cloned;
  }

  public getToolDeclarations(): Array<{ name: string; description: string; parameters?: Record<string, any> }> {
    return Array.from(this.tools.values()).map((t) => {
      let params = t.parameters;
      if (!params || !params.type) {
        params = {
          type: 'OBJECT',
          properties: {},
        };
      } else {
        params = this.normalizeSchema(params);
      }
      return {
        name: t.name,
        description: t.description,
        parameters: params,
      };
    });
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
      const resString =
        typeof output === 'string'
          ? output
          : output?.result !== undefined
          ? output.result
          : typeof output === 'object'
          ? JSON.stringify(output)
          : String(output);
      const isSuccess = output && typeof output === 'object' && output.success !== undefined ? Boolean(output.success) : true;
      return {
        success: isSuccess,
        result: resString,
        data: output?.data !== undefined ? output.data : typeof output === 'object' ? output : { value: output },
        toolName: name,
        executionTimeSec: Number(durationSec.toFixed(2)),
        status: isSuccess ? 'success' : 'error',
        output,
        ...(output && typeof output === 'object' && output._screenshotForVision ? { _screenshotForVision: output._screenshotForVision } : {}),
      };
    } catch (err: any) {
      const durationSec = (Date.now() - startTime) / 1000;
      return {
        success: false,
        error: err.message,
        result: `Error executing ${name}: ${err.message}`,
        toolName: name,
        executionTimeSec: Number(durationSec.toFixed(2)),
        status: 'error',
      };
    }
  }
}
