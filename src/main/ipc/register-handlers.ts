import { ipcMain, app, shell, BrowserWindow, dialog, clipboard, nativeImage, Notification, desktopCapturer } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, spawn } from 'child_process';
import { IPC_CHANNELS } from '../../shared/contracts/ipc';
import type {
  TaskItem,
  NoteItem,
  ChatMessage,
  AppSettings,
  MemoryEntry,
  InfoPanelPayload,
} from '../../shared/types';
import {
  ToolExecuteSchema,
  AssignAgentTaskSchema,
  InfoPanelSchema,
} from '../../shared/schemas';
import { LocalStore } from '../services/storage/local-store';
import { firebaseService } from '../services/auth/firebase-service';
import express from 'express';
import { MemoryService } from '../services/memory/memory-service';
import { ToolRegistry } from '../services/tools/tool-registry';
import { AIService } from '../services/ai/ai-service';
import { AgentCoordinator } from '../services/agents/agent-coordinator';
import { InfoPanelWindowManager } from '../windows/info-panel-window';
import {
  minimizeMainWindow,
  toggleMaximizeMainWindow,
  closeMainWindow,
  getMainWindow,
} from '../windows/main-window';
import { hardwareService } from '../services/hardware/hardware-service';
import { whatsAppManager } from '../services/whatsapp/whatsapp-manager';
import {
  generateHardwareId,
  getLicenseStatus,
  isLicenseBlocked,
  isLicenseApproved,
  isEffectiveLicensed,
  savePendingLicense,
  registerDeviceWithBackend,
  checkRemoteLicenseStatus,
  sendHeartbeat,
  startLicenseApprovalWatch,
  startLicenseMonitor,
} from '../services/license/license-manager';
import { authCredentialStore } from '../services/auth/auth-credential-store';
import { browserManager } from '../services/tools/browser-manager';
import { registerDesktopHandlers } from '../services/tools/desktop-manager';
import {
  getAutoUpdateEnabled,
  setAutoUpdateEnabled,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} from '../services/auto-updater';
import {
  readConfig as readToolsConfig,
  writeConfig as writeToolsConfig,
  fetchGeminiModels,
  fetchOpenRouterModels,
  DEFAULT_CONFIG as DEFAULT_TOOLS_CONFIG,
} from '../services/tools/tools-config-manager';

export interface IpcContext {
  tasksStore: LocalStore<TaskItem[]>;
  notesStore: LocalStore<NoteItem[]>;
  chatsStore: LocalStore<ChatMessage[]>;
  settingsStore: LocalStore<AppSettings>;
  genericStore: LocalStore<Record<string, unknown>>;
  memoryService: MemoryService;
  toolRegistry: ToolRegistry;
  aiService: AIService;
  agentCoordinator: AgentCoordinator;
  infoPanelManager: InfoPanelWindowManager;
  skillsService: any; // Using any or importing SkillsService, let's just use any or import
}

export function registerIpcHandlers(ctx: IpcContext): void {
  // ── 1. App & System ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_GET_PATHS, () => {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      home: app.getPath('home'),
      temp: app.getPath('temp'),
      documents: app.getPath('documents'),
      logs: app.getPath('logs'),
      desktop: app.getPath('desktop'),
    };
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    minimizeMainWindow();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    toggleMaximizeMainWindow();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    closeMainWindow();
  });

  // ── 2. Storage CRUD ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.STORAGE_GET, (_event, key: string) => {
    const data = ctx.genericStore.get();
    return data[key];
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SET, (_event, key: string, value: unknown) => {
    ctx.genericStore.update((current) => ({
      ...current,
      [key]: value,
    }));
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD_TASKS, () => {
    return ctx.tasksStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE_TASKS, (_event, tasks: TaskItem[]) => {
    if (Array.isArray(tasks)) {
      ctx.tasksStore.set(tasks);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD_NOTES, () => {
    return ctx.notesStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE_NOTES, (_event, notes: NoteItem[]) => {
    if (Array.isArray(notes)) {
      ctx.notesStore.set(notes);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD_CHATS, () => {
    return ctx.chatsStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE_CHATS, (_event, chats: ChatMessage[]) => {
    if (Array.isArray(chats)) {
      ctx.chatsStore.set(chats);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD_SETTINGS, () => {
    return ctx.settingsStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE_SETTINGS, (_event, settings: AppSettings) => {
    if (settings && typeof settings === 'object') {
      ctx.settingsStore.set(settings);
      if (settings.geminiApiKey) {
        ctx.aiService.setApiKey(settings.geminiApiKey);
      }
      if (settings.openRouterApiKey) {
        ctx.aiService.setOpenRouterKey(settings.openRouterApiKey);
      }
      return true;
    }
    return false;
  });

  // ── 3. Memory Service ───────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.MEMORY_READ_RAW, () => {
    return ctx.memoryService.readRawMemory();
  });

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_WRITE_ENTRY,
    (_event, { category, fact }: { category: string; fact: string }) => {
      if (!fact) return false;
      return ctx.memoryService.appendMemoryFact(category || 'General', fact);
    }
  );

  ipcMain.handle(IPC_CHANNELS.MEMORY_DELETE_ENTRY, (_event, id: string) => {
    const raw = ctx.memoryService.readRawMemory();
    const lines = raw.split('\n');
    const filtered = lines.filter((line) => !line.includes(id));
    return ctx.memoryService.writeRawMemory(filtered.join('\n'));
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_OPTIMIZE, () => {
    return ctx.memoryService.optimizeMemory();
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_ALL, () => {
    const raw = ctx.memoryService.readRawMemory();
    const lines = raw.split('\n');
    const entries: MemoryEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('- [')) {
        // Format: - [date] [category] fact
        const match = line.match(/^-\s*\[(.*?)\]\s*\[(.*?)\]\s*(.*)$/);
        if (match) {
          entries.push({
            id: `mem-${i}-${match[1]}`,
            timestamp: match[1],
            category: match[2],
            fact: match[3],
            source: 'observation',
          });
          continue;
        }
      }
      if (line.startsWith('- ') && !line.startsWith('- User Name:') && !line.startsWith('- Companion Role:')) {
        entries.push({
          id: `mem-${i}`,
          timestamp: new Date().toISOString().split('T')[0],
          category: 'General',
          fact: line.replace(/^-\s*/, ''),
          source: 'user',
        });
      }
    }
    return entries;
  });

  // ── 4. AI & Generation ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_STREAM,
    async (
      event,
      payload: {
        prompt: string;
        history?: ChatMessage[];
        options?: Record<string, unknown>;
      }
    ) => {
      const result = await ctx.aiService.generateStream(payload, (token) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('ai:stream-token', token);
        }
      });
      if (result && result.toolCalls && result.toolCalls.length > 0 && !event.sender.isDestroyed()) {
        for (const tr of result.toolCalls) {
          event.sender.send('ai:tool-result', tr);
        }
      }
      return result;
    }
  );

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_STREAM, () => {
    ctx.aiService.cancelStream();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_IMAGE, async (_event, prompt: string) => {
    return await ctx.aiService.generateImage(prompt);
  });

  // ── 5. Tools Execution ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TOOLS_EXECUTE,
    async (_event, rawArgs: any) => {
      const normalized = {
        toolName: rawArgs?.toolName,
        params: rawArgs?.params ?? rawArgs?.args ?? {},
      };
      const parsed = ToolExecuteSchema.safeParse(normalized);
      if (!parsed.success) {
        return {
          toolName: rawArgs?.toolName || 'unknown',
          status: 'error',
          error: `Invalid tool parameters: ${parsed.error.message}`,
        };
      }
      return await ctx.toolRegistry.execute(parsed.data.toolName, parsed.data.params);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TOOLS_LIST, () => {
    return ctx.toolRegistry.listTools();
  });

  // ── 6. Agent Town Delegation ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AGENTS_ASSIGN_TASK,
    (_event, args: { agentName?: string; title: string; description: string }) => {
      const parsed = AssignAgentTaskSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(`Invalid agent task parameters: ${parsed.error.message}`);
      }
      return ctx.agentCoordinator.assignTask(
        parsed.data.agentName,
        parsed.data.title,
        parsed.data.description
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.AGENTS_INSPECT_TASK, (_event, taskId: string) => {
    return ctx.agentCoordinator.getTask(taskId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENTS_STOP_TASK, (_event, taskId: string) => {
    return ctx.agentCoordinator.stopTask(taskId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENTS_LIST_TASKS, () => {
    return ctx.agentCoordinator.listTasks();
  });

  ipcMain.handle(IPC_CHANNELS.AGENTS_GET_STATES, () => {
    return ctx.agentCoordinator.getAgentStates();
  });

  // ── 7. Native Info Panels ───────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.INFO_PANEL_OPEN, async (_event, payload: InfoPanelPayload) => {
    const parsed = InfoPanelSchema.safeParse(payload);
    const validPayload: InfoPanelPayload = parsed.success
      ? (parsed.data as InfoPanelPayload)
      : {
          panelId: payload?.panelId || 'default',
          title: payload?.title || 'System Info',
          content: payload?.content || '',
          theme: (payload?.theme as any) || 'cyan',
        };
    await ctx.infoPanelManager.openPanel(validPayload);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.INFO_PANEL_CLOSE, (_event, panelId: string) => {
    return ctx.infoPanelManager.closePanel(panelId);
  });

  ipcMain.handle(IPC_CHANNELS.INFO_PANEL_GET_DATA, (_event, panelId: string) => {
    return ctx.infoPanelManager.getPanelData(panelId);
  });

  // ── 8. Media Player ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.MEDIA_CONTROL, (_event, { action, data }: { action: string; data?: unknown }) => {
    return { success: true, action, data };
  });

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAY_YOUTUBE, async (_event, url: string) => {
    // Media URL playback trigger
    return { success: true, url };
  });

  // ── 9. WhatsApp ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.WHATSAPP_GET_STATUS, () => {
    return whatsAppManager.getState();
  });

  ipcMain.handle(IPC_CHANNELS.WHATSAPP_START_AUTH, async () => {
    return await whatsAppManager.initialize();
  });

  ipcMain.handle(IPC_CHANNELS.WHATSAPP_LOGOUT, async () => {
    return await whatsAppManager.logout();
  });

  ipcMain.handle(
    IPC_CHANNELS.WHATSAPP_SEND_MESSAGE,
    async (_event, { to, message }: { to: string; message: string }) => {
      const sent = await whatsAppManager.sendReply(to, message);
      return {
        success: sent,
        error: sent ? undefined : 'WhatsApp bridge is not ready or failed to send.',
      };
    }
  );

  // ── 10. Hardware & Arduino ──────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.HARDWARE_LIST_PORTS, async () => {
    return await hardwareService.listPorts();
  });

  ipcMain.handle(IPC_CHANNELS.HARDWARE_CONNECT, async (_event, { port }: { port?: string } = {}) => {
    if (!port) return { success: false, error: 'Port parameter required' };
    return await hardwareService.connect(port);
  });

  ipcMain.handle(IPC_CHANNELS.HARDWARE_DISCONNECT, () => {
    return hardwareService.disconnect();
  });

  // ── 11. Audio & Sound Effects ───────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AUDIO_PLAY_SFX, (_event, soundName: string) => {
    return { success: true, sound: soundName };
  });

  // ── 12. Skills & Additional Handlers ────────────────────────────────────────
  ipcMain.handle('skills-list', () => {
    return ctx.skillsService.listSkills();
  });

  ipcMain.handle('skills-toggle', (_event, folderNameOrObj: any, enabledParam?: boolean, isCoreParam?: boolean) => {
    const folderName = typeof folderNameOrObj === 'object' ? folderNameOrObj.folderName : folderNameOrObj;
    const enabled = typeof folderNameOrObj === 'object' ? folderNameOrObj.enabled : enabledParam;
    const isCore = typeof folderNameOrObj === 'object' ? folderNameOrObj.isCore : isCoreParam;
    return ctx.skillsService.toggleSkill(folderName, enabled, isCore);
  });

  ipcMain.handle('skills-save', (_event, data: any) => {
    return ctx.skillsService.saveSkill(data);
  });

  ipcMain.handle('skills-delete', (_event, folderNameOrObj: any, isCoreParam?: boolean) => {
    const folderName = typeof folderNameOrObj === 'object' ? folderNameOrObj.folderName : folderNameOrObj;
    const isCore = typeof folderNameOrObj === 'object' ? folderNameOrObj.isCore : isCoreParam;
    return ctx.skillsService.deleteSkill(folderName, isCore);
  });

  ipcMain.handle('load-bootstrap-file', (_event, filenameOrObj: any) => {
    const filename = typeof filenameOrObj === 'object' ? filenameOrObj.filename : filenameOrObj;
    if (filename === 'MEMORY.md') {
      return { filename, content: ctx.memoryService.readRawMemory() };
    }
    if (filename === 'SOUL.md') {
      return { filename, content: ctx.memoryService.readSoul() };
    }
    return { filename, content: '' };
  });

  ipcMain.handle('write-bootstrap-file', (_event, filenameOrObj: any, contentParam?: string) => {
    const filename = typeof filenameOrObj === 'object' ? filenameOrObj.filename : filenameOrObj;
    const content = typeof filenameOrObj === 'object' ? filenameOrObj.content : contentParam;
    return ctx.memoryService.writeBootstrapFile(filename, content || '');
  });

  // ── Helper functions for userData file persistence ─────────────────────────
  const getUserDataPath = (...subpaths: string[]) => path.join(app.getPath('userData'), ...subpaths);

  const getSecretKeyFromDiskOrStore = (): string => {
    try {
      const p = getUserDataPath('secret_key.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const key = data?.data?.geminiKey || data?.apiKey || data?.geminiKey || data?.key;
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
      const rootP = path.join(app.getAppPath(), 'secret_key.json');
      if (fs.existsSync(rootP)) {
        const data = JSON.parse(fs.readFileSync(rootP, 'utf8'));
        const key = data?.data?.geminiKey || data?.apiKey || data?.geminiKey || data?.key;
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
    } catch {}
    return ctx.settingsStore.get().geminiApiKey || process.env.GEMINI_API_KEY || '';
  };

  const syncHermesDotEnv = (geminiKey?: string, openRouterKey?: string) => {
    try {
      const hermesDir = path.join(os.homedir(), '.hermes');
      if (!fs.existsSync(hermesDir)) {
        fs.mkdirSync(hermesDir, { recursive: true });
      }
      const envPath = path.join(hermesDir, '.env');
      let lines: string[] = [];
      if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, 'utf8').split('\n');
      }
      const map: Record<string, string> = {};
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq > 0) {
          map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
      if (geminiKey) map['GEMINI_API_KEY'] = geminiKey;
      if (openRouterKey) map['OPENROUTER_API_KEY'] = openRouterKey;
      const updated = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
      fs.writeFileSync(envPath, updated, 'utf8');
    } catch (_) {}
  };

  const saveSecretKeyToDiskAndStore = (apiKey: string, voice?: string): boolean => {
    const cleanKey = String(apiKey || '').trim();
    // 1. Update secret_key.json
    try {
      const p = getUserDataPath('secret_key.json');
      let data: any = {};
      if (fs.existsSync(p)) {
        try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
      }
      if (!data || typeof data !== 'object') data = {};
      if (!data.data) data.data = {};
      data.data.geminiKey = cleanKey;
      data.apiKey = cleanKey;
      data.geminiKey = cleanKey;
      data.key = cleanKey;
      if (voice !== undefined) data.voice = voice;
      data._meta = { updatedAt: Date.now() };
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.warn('[IPC] Error writing secret_key.json:', e);
    }

    // 2. Synchronize to agent_town_config.json if Gemini is used
    try {
      const townPath = getUserDataPath('agent_town_config.json');
      let townConfig: any = {};
      if (fs.existsSync(townPath)) {
        try { townConfig = JSON.parse(fs.readFileSync(townPath, 'utf8')); } catch {}
      }
      townConfig.geminiApiKey = cleanKey;
      if (!townConfig.provider || townConfig.provider === 'gemini') {
        townConfig.apiKey = cleanKey;
      }
      townConfig.updatedAt = Date.now();
      fs.writeFileSync(townPath, JSON.stringify(townConfig, null, 2), 'utf8');
    } catch {}

    // 3. Update settingsStore
    ctx.settingsStore.update((current) => ({
      ...current,
      geminiApiKey: cleanKey,
      selectedVoice: voice || current.selectedVoice,
    }));

    // 4. Dynamically propagate to aiService, geminiService and hermes immediately
    ctx.aiService.setApiKey(cleanKey);
    ctx.aiService.getGeminiService().setApiKey(cleanKey);
    syncHermesDotEnv(cleanKey, undefined);

    return true;
  };

  const getOpenRouterKeyFromDiskOrStore = (): string => {
    try {
      const p = getUserDataPath('openrouter_key.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const key = data?.apiKey || data?.key || data?.token || (typeof data === 'string' ? data : '');
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
    } catch {}
    try {
      const townPath = getUserDataPath('agent_town_config.json');
      if (fs.existsSync(townPath)) {
        const data = JSON.parse(fs.readFileSync(townPath, 'utf8'));
        const key = data?.openRouterApiKey || (data?.provider === 'openrouter' ? data?.apiKey : '');
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
    } catch {}
    return ctx.settingsStore.get().openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
  };

  const saveOpenRouterKeyToDiskAndStore = (token: string): boolean => {
    const cleanToken = String(token || '').trim();
    try {
      const p = getUserDataPath('openrouter_key.json');
      fs.writeFileSync(
        p,
        JSON.stringify({ apiKey: cleanToken, key: cleanToken, token: cleanToken, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.warn('[IPC] Error writing openrouter_key.json:', e);
    }

    ctx.settingsStore.update((current) => ({
      ...current,
      openRouterApiKey: cleanToken,
    }));

    ctx.aiService.setOpenRouterKey(cleanToken);
    ctx.aiService.getGeminiService().setOpenRouterKey(cleanToken);
    syncHermesDotEnv(undefined, cleanToken);
    return true;
  };

  const getHFKeyFromDiskOrStore = (): string => {
    try {
      const p = getUserDataPath('hf_key.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const key = data?.apiKey || data?.hfKey || data?.key || data?.token || (typeof data === 'string' ? data : '');
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
    } catch {}
    try {
      const skp = getUserDataPath('secret_key.json');
      if (fs.existsSync(skp)) {
        const data = JSON.parse(fs.readFileSync(skp, 'utf8'));
        const key = data?.data?.hfKey || data?.hfKey;
        if (key && typeof key === 'string' && key.trim()) return key.trim();
      }
    } catch {}
    return ctx.settingsStore.get().huggingFaceApiKey || process.env.HUGGINGFACE_API_KEY || '';
  };

  const saveHFKeyToDiskAndStore = (token: string): boolean => {
    const cleanToken = String(token || '').trim();
    try {
      const p = getUserDataPath('hf_key.json');
      fs.writeFileSync(
        p,
        JSON.stringify({ apiKey: cleanToken, hfKey: cleanToken, key: cleanToken, updatedAt: Date.now() }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.warn('[IPC] Error writing hf_key.json:', e);
    }

    ctx.settingsStore.update((current) => ({
      ...current,
      huggingFaceApiKey: cleanToken,
    }));
    return true;
  };

  // ── Secret Key Files Handlers (secret_key.json, openrouter_key.json, hf_key.json) ──
  ipcMain.handle('get-secret-key', () => getSecretKeyFromDiskOrStore());
  ipcMain.handle('save-secret-key', (_event, keyOrObj: any) => {
    const key = typeof keyOrObj === 'object'
      ? (keyOrObj?.apiKey || keyOrObj?.geminiKey || keyOrObj?.key || keyOrObj?.secretKey || '')
      : String(keyOrObj || '');
    return saveSecretKeyToDiskAndStore(key);
  });
  ipcMain.handle('get-gemini-token', () => getSecretKeyFromDiskOrStore());
  ipcMain.handle('save-gemini-key', (_event, apiKeyOrObj: any, voiceParam?: string) => {
    const apiKey = typeof apiKeyOrObj === 'object'
      ? (apiKeyOrObj?.apiKey || apiKeyOrObj?.geminiKey || apiKeyOrObj?.key || '')
      : String(apiKeyOrObj || '');
    const voice = typeof apiKeyOrObj === 'object' ? (apiKeyOrObj?.voice || voiceParam) : voiceParam;
    return saveSecretKeyToDiskAndStore(apiKey, voice);
  });
  ipcMain.handle('save-gemini-token', (_event, apiKeyOrObj: any, voiceParam?: string) => {
    const apiKey = typeof apiKeyOrObj === 'object'
      ? (apiKeyOrObj?.apiKey || apiKeyOrObj?.geminiKey || apiKeyOrObj?.key || '')
      : String(apiKeyOrObj || '');
    const voice = typeof apiKeyOrObj === 'object' ? (apiKeyOrObj?.voice || voiceParam) : voiceParam;
    return saveSecretKeyToDiskAndStore(apiKey, voice);
  });

  ipcMain.handle('get-openrouter-token', () => getOpenRouterKeyFromDiskOrStore());
  ipcMain.handle('save-openrouter-token', (_event, tokenOrObj: any) => {
    const token = typeof tokenOrObj === 'object'
      ? (tokenOrObj?.apiKey || tokenOrObj?.key || tokenOrObj?.token || '')
      : String(tokenOrObj || '');
    return saveOpenRouterKeyToDiskAndStore(token);
  });

  ipcMain.handle('save-llm-settings', (_event, providerOrObj: any, modelIdParam?: string, openRouterKeyParam?: string) => {
    const provider = typeof providerOrObj === 'object' ? (providerOrObj?.provider || 'gemini') : (providerOrObj || 'gemini');
    const modelId = typeof providerOrObj === 'object' ? (providerOrObj?.modelId || '') : (modelIdParam || '');
    const openRouterKey = typeof providerOrObj === 'object' ? (providerOrObj?.openRouterKey || providerOrObj?.openRouterApiKey || '') : (openRouterKeyParam || '');

    if (openRouterKey) {
      saveOpenRouterKeyToDiskAndStore(openRouterKey);
    }

    try {
      const townPath = getUserDataPath('agent_town_config.json');
      let townConfig: any = {};
      if (fs.existsSync(townPath)) {
        try { townConfig = JSON.parse(fs.readFileSync(townPath, 'utf8')); } catch {}
      }
      townConfig.provider = provider;
      if (modelId) townConfig.modelId = modelId;
      if (openRouterKey) {
        townConfig.openRouterApiKey = openRouterKey;
        if (provider === 'openrouter') {
          townConfig.apiKey = openRouterKey;
        }
      }
      townConfig.updatedAt = Date.now();
      fs.writeFileSync(townPath, JSON.stringify(townConfig, null, 2), 'utf8');
    } catch {}

    ctx.settingsStore.update((current) => ({
      ...current,
      primaryProvider: provider,
      primaryModelId: modelId || current.primaryModelId,
      primaryModel: modelId || current.primaryModel,
      openRouterApiKey: openRouterKey || current.openRouterApiKey,
    }));

    // Dynamic model settings propagation: update active model ID and keys immediately
    if (openRouterKey) {
      ctx.aiService.setOpenRouterKey(openRouterKey);
      ctx.aiService.getGeminiService().setOpenRouterKey(openRouterKey);
    }
    if (modelId) {
      ctx.aiService.setPrimaryModel(modelId);
      ctx.aiService.getGeminiService().setPrimaryModel(modelId);
      ctx.agentCoordinator.setActiveModel(modelId);
    }

    return true;
  });

  ipcMain.handle('read-hf-key', () => getHFKeyFromDiskOrStore());
  ipcMain.handle('save-huggingface-token', (_event, tokenOrObj: any) => {
    const token = typeof tokenOrObj === 'object'
      ? (tokenOrObj?.apiKey || tokenOrObj?.hfKey || tokenOrObj?.token || tokenOrObj?.key || '')
      : String(tokenOrObj || '');
    return saveHFKeyToDiskAndStore(token);
  });
  ipcMain.handle('get-huggingface-token', () => getHFKeyFromDiskOrStore());

  // ── 13. Firebase Auth Handlers & Google OAuth Server ────────────────────────
  let activeOAuthServer: any = null;

  const stopOAuthCallbackServer = () => {
    if (activeOAuthServer) {
      try {
        activeOAuthServer.close();
      } catch {}
      activeOAuthServer = null;
    }
  };

  ipcMain.handle('auth-stop-callback-server', () => {
    stopOAuthCallbackServer();
    return { success: true };
  });

  ipcMain.handle('auth-start-callback-server', async () => {
    return new Promise((resolve) => {
      stopOAuthCallbackServer();

      const authConfig = firebaseService.getOAuthConfig();
      const serverApp = express();

      const server = serverApp.listen(53921, '0.0.0.0', () => {
        shell.openExternal(authConfig.authUrl);
      });

      activeOAuthServer = server;

      server.on('error', (err: any) => {
        console.error('[OAuth Server Error]:', err.message);
        stopOAuthCallbackServer();
        resolve({ success: false, error: err.message });
      });

      serverApp.get('/callback', async (req, res) => {
        const code = req.query.code as string;
        const error = req.query.error as string;

        if (error) {
          res.status(400).send(`<h1>Authentication failed</h1><p>${error}</p>`);
          stopOAuthCallbackServer();
          resolve({ success: false, error });
          return;
        }

        if (!code) {
          res.status(400).send('<h1>Invalid request</h1><p>No authorization code received.</p>');
          stopOAuthCallbackServer();
          resolve({ success: false, error: 'No authorization code received' });
          return;
        }

        try {
          const user = await firebaseService.exchangeGoogleCode(code);
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Authentication Successful</title>
                <style>
                  body {
                    background-color: #090B10;
                    color: #00f0ff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                  }
                  h1 { margin-bottom: 8px; }
                  p { color: #8892b0; }
                </style>
              </head>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this tab and return to Akki AI.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          stopOAuthCallbackServer();

          // Connect to Hostinger backend: Register device with imakshay.in
          const hwid = generateHardwareId();
          const regRes = await registerDeviceWithBackend({
            email: user.email,
            name: user.displayName || user.email,
            photo_url: user.photoURL || '',
          });

          if (regRes.status === 'approved') {
            startLicenseMonitor(hwid, user.email, () => {
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send('license-status-changed', { status: 'blocked' });
              }
            });
            resolve({ success: true, user, status: 'approved', hwid });
          } else if (regRes.status === 'blocked') {
            resolve({ success: false, error: 'Your device access has been blocked by the administrator.', status: 'blocked', hwid });
          } else {
            // Start polling watch so when admin clicks approve in admin panel, it automatically unlocks
            startLicenseApprovalWatch(hwid, user.email, (status) => {
              const win = getMainWindow();
              if (win && !win.isDestroyed()) {
                win.webContents.send('license-status-changed', { status });
              }
            });
            resolve({ success: true, user, status: 'pending', hwid });
          }
        } catch (err: any) {
          console.error('[OAuth Callback Error]:', err);
          res.status(500).send(`<html><body><h1>Error signing in</h1><p>${err.message}</p></body></html>`);
          stopOAuthCallbackServer();
          resolve({ success: false, error: err.message });
        }
      });

      setTimeout(() => {
        if (activeOAuthServer === server) {
          stopOAuthCallbackServer();
          resolve({ success: false, error: 'Authentication timed out' });
        }
      }, 300000);
    });
  });

  ipcMain.handle('auth-check-access', async () => {
    try {
      const session = await firebaseService.getStoredSession();
      const authed = !!(session && session.authenticated);
      const hwId = generateHardwareId();
      const email = session?.user?.email;

      if (email) {
        // Query live Hostinger backend check_status.php for real-time admin approval / blocking
        await checkRemoteLicenseStatus(email, hwId);
      }

      const licensed = isEffectiveLicensed();
      const blocked = isLicenseBlocked();
      const access = authed && licensed && !blocked;

      if (access && email) {
        startLicenseMonitor(hwId, email, () => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('license-status-changed', { status: 'blocked' });
          }
        });
      }

      return {
        success: access,
        approved: licensed,
        blocked,
        access,
        user: session?.user || null,
        message: blocked
          ? 'License blocked by administrator'
          : licensed
            ? 'Access granted'
            : 'License not approved',
      };
    } catch (err: any) {
      return {
        success: false,
        approved: false,
        blocked: false,
        access: false,
        message: err.message || 'Authentication check failed',
      };
    }
  });

  ipcMain.handle('auth-logout-device', async () => {
    await firebaseService.signOutUser();
    return true;
  });

  // ── 14. Browser Manager Handlers ──────────────────────────────────────────
  // ── 14. Browser Manager Handlers ──────────────────────────────────────────
  const getBrowser = () => browserManager;

  ipcMain.handle('browser-navigate', async (_event, url: string) => getBrowser().navigate(url));
  ipcMain.handle('browser-screenshot', async () => getBrowser().screenshot());
  ipcMain.handle('browser-get-html', async () => getBrowser().extract());
  ipcMain.handle('browser-click', async (_event, selector: string) => getBrowser().click(selector));
  ipcMain.handle('browser-type', async (_event, selector: string, value: string) => getBrowser().fill(selector, value));
  ipcMain.handle('browser-go-back', async () => {
    try { const p = await getBrowser().getPage(); await p.goBack(); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-go-forward', async () => {
    try { const p = await getBrowser().getPage(); await p.goForward(); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-reload', async () => {
    try { const p = await getBrowser().getPage(); await p.reload(); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-extract', async () => getBrowser().scrape());
  ipcMain.handle('browser-snapshot', async () => getBrowser().extract());
  ipcMain.handle('browser-query-selector', async (_event, { selector }: any) => {
    try {
      const p = await getBrowser().getPage();
      const texts = await p.$$eval(selector || 'a', (els: any[]) => els.slice(0, 20).map((e: any) => e.textContent?.trim() || ''));
      return { success: true, texts };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle('browser-fill-form', async (_event, { fields }: any) => {
    try {
      const p = await getBrowser().getPage();
      if (fields && typeof fields === 'object') {
        for (const [sel, val] of Object.entries(fields)) {
          await p.fill(sel, String(val));
        }
      }
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle('browser-hover', async (_event, { selector }: any) => {
    try { const p = await getBrowser().getPage(); await p.hover(selector); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-select', async (_event, { selector, value }: any) => {
    try { const p = await getBrowser().getPage(); await p.selectOption(selector, value); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-press-key', async (_event, key: string) => {
    try { const p = await getBrowser().getPage(); await p.keyboard.press(key); return { success: true }; } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-scroll', async (_event, { direction, amount }: any) => {
    try {
      const p = await getBrowser().getPage();
      const deltaY = direction === 'up' ? -(amount || 300) : (amount || 300);
      await p.mouse.wheel(0, deltaY);
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-scroll-into-view', async (_event, { selector }: any) => {
    try {
      const p = await getBrowser().getPage();
      await p.locator(selector).scrollIntoViewIfNeeded();
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-highlight', async () => ({ success: true }));
  ipcMain.handle('browser-wait', async (_event, opts: any) => {
    try {
      const p = await getBrowser().getPage();
      const ms = typeof opts === 'number' ? opts : opts?.timeoutMs || 1000;
      await p.waitForTimeout(ms);
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-execute-script', async (_event, script: string) => {
    try {
      const p = await getBrowser().getPage();
      const res = await p.evaluate((code: string) => eval(code), script);
      return { success: true, result: res };
    } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-upload-file', async () => ({ success: true }));
  ipcMain.handle('browser-wait-download', async () => ({ success: true }));
  ipcMain.handle('browser-download-by-click', async () => ({ success: true }));
  ipcMain.handle('browser-handle-dialog', async () => ({ success: true }));
  ipcMain.handle('browser-save-pdf', async () => ({ success: true }));
  ipcMain.handle('browser-get-cookies', async () => []);
  ipcMain.handle('browser-set-cookie', async () => true);
  ipcMain.handle('browser-clear-cookies', async () => true);
  ipcMain.handle('browser-get-storage', async () => ({}));
  ipcMain.handle('browser-set-storage', async () => true);
  ipcMain.handle('browser-clear-storage', async () => true);
  ipcMain.handle('browser-resize-viewport', async (_event, { width, height }: any) => {
    try {
      const p = await getBrowser().getPage();
      await p.setViewportSize({ width: width || 1280, height: height || 720 });
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  });
  ipcMain.handle('browser-emulate-device', async () => ({ success: true }));
  ipcMain.handle('browser-emulate-color-scheme', async () => ({ success: true }));
  ipcMain.handle('browser-set-offline', async () => ({ success: true }));
  ipcMain.handle('browser-set-extra-headers', async () => ({ success: true }));
  ipcMain.handle('browser-set-http-credentials', async () => ({ success: true }));
  ipcMain.handle('browser-set-geolocation', async () => ({ success: true }));
  ipcMain.handle('browser-get-console', async () => []);
  ipcMain.handle('browser-get-errors', async () => []);
  ipcMain.handle('browser-get-tabs', async () => [{ id: 'tab-1', active: true }]);
  ipcMain.handle('browser-switch-tab', async () => ({ success: true }));
  ipcMain.handle('browser-new-tab', async (_event, { url }: any) => {
    if (url) return await getBrowser().navigate(url);
    return { success: true };
  });
  ipcMain.handle('browser-close-tab', async () => ({ success: true }));
  ipcMain.handle('browser-drag-drop', async () => ({ success: true }));
  ipcMain.handle('browser-close', async () => {
    await getBrowser().close();
    return { success: true };
  });

  // ── 15. Desktop Manager Handlers ──────────────────────────────────────────
  try { registerDesktopHandlers(); } catch (e) {}

  // ── 16. System, File & Execution Handlers ──────────────────────────────────
  const activeExecCommands = new Map<string, any>();

  ipcMain.handle('system-fs-op', async (_event, { operation, path: targetPath, content, dest }: any) => {
    try {
      if (!targetPath) return false;
      const resolvedPath = path.resolve(targetPath);
      const resolvedDest = dest ? path.resolve(dest) : undefined;
      switch (operation) {
        case 'read-dir':
          if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) return [];
          return fs.readdirSync(resolvedPath);
        case 'create-dir':
          if (!fs.existsSync(resolvedPath)) fs.mkdirSync(resolvedPath, { recursive: true });
          return true;
        case 'write-file': {
          const dir = path.dirname(resolvedPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(resolvedPath, content || '', 'utf-8');
          return true;
        }
        case 'read-file':
          return fs.readFileSync(resolvedPath, 'utf-8');
        case 'delete':
          if (fs.existsSync(resolvedPath)) fs.rmSync(resolvedPath, { recursive: true, force: true });
          return true;
        case 'exists':
          return fs.existsSync(resolvedPath);
        case 'rename':
          if (resolvedDest) fs.renameSync(resolvedPath, resolvedDest);
          return true;
        case 'copy-file':
          if (resolvedDest) fs.copyFileSync(resolvedPath, resolvedDest);
          return true;
        default:
          return null;
      }
    } catch (err: any) {
      console.error('[FS-OP Error]:', err.message);
      return { error: err.message };
    }
  });

  ipcMain.handle('system-open', async (_event, { target }: any) => {
    if (!target) return false;
    const clean = String(target).trim();
    if (/^https?:\/\//i.test(clean) || /^mailto:/i.test(clean)) {
      await shell.openExternal(clean);
      return true;
    }
    const resolved = path.resolve(clean);
    if (fs.existsSync(resolved)) {
      await shell.openPath(resolved);
      return true;
    }
    await shell.openPath(clean);
    return true;
  });

  ipcMain.handle('system-exec-command', async (_event, { commandId, command, workingDir, timeout }: any) => {
    return new Promise((resolve) => {
      const resolvedWorkingDir = workingDir ? path.resolve(workingDir) : os.homedir();
      const resolvedCommandId = commandId || `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const options = {
        maxBuffer: 10 * 1024 * 1024,
        timeout: Math.max(5000, Math.min(timeout || 30000, 300000)),
        cwd: resolvedWorkingDir,
        env: { ...process.env },
        windowsHide: true,
      };
      const child = exec(command, options, (error, stdout, stderr) => {
        activeExecCommands.delete(resolvedCommandId);
        resolve({
          success: !error,
          commandId: resolvedCommandId,
          stdout: stdout ? stdout.toString().substring(0, 100000) : '',
          stderr: stderr ? stderr.toString().substring(0, 50000) : '',
          error: error?.message,
          exitCode: error?.code || 0,
        });
      });
      activeExecCommands.set(resolvedCommandId, child);
    });
  });

  ipcMain.handle('system-cancel-command', async (_event, { commandId }: any) => {
    const child = activeExecCommands.get(commandId);
    if (!child) return { success: false, commandId, alreadyFinished: true };
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else if (child.pid) {
        child.kill('SIGKILL');
      }
    } catch (_) {}
    activeExecCommands.delete(commandId);
    return { success: true, commandId };
  });

  ipcMain.handle('get-processes', async () => {
    return await ctx.toolRegistry.execute('get_processes', {});
  });

  ipcMain.handle('kill-process', async (_event, { pid }: any) => {
    return await ctx.toolRegistry.execute('kill_process', { pid });
  });

  ipcMain.handle('window-control', async (_event, { action }: any) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { error: 'No focused window' };
    switch (action) {
      case 'minimize': win.minimize(); break;
      case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
      case 'close': win.close(); break;
      case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
    }
    return { success: true };
  });

  ipcMain.handle('close-window', () => closeMainWindow());
  ipcMain.handle('minimize-window', () => minimizeMainWindow());
  ipcMain.handle('maximize-window', () => toggleMaximizeMainWindow());
  ipcMain.handle('fullscreen-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
    return true;
  });

  ipcMain.handle('web-search', async (_event, { query }: any) => {
    return await ctx.toolRegistry.execute('web_search', { query });
  });

  ipcMain.handle('jina-deep-search', async (_event, query: string) => {
    try {
      const q = typeof query === 'string' ? query : (query as any)?.query || '';
      return await ctx.toolRegistry.execute('web_search', { query: q });
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('jina-read-url', async (_event, targetUrl: string) => {
    return await ctx.toolRegistry.execute('deep_search', { url: targetUrl });
  });

  ipcMain.handle('search-files-content', async (_event, { query, searchPath }: any) => {
    try {
      const basePath = searchPath ? path.resolve(searchPath) : path.join(app.getPath('documents'), 'Akki Data');
      if (!fs.existsSync(basePath)) return { success: false, error: 'Path not found' };
      const results: any[] = [];
      const regex = new RegExp(query, 'gi');
      function walk(dir: string, depth = 0) {
        if (depth > 4 || results.length >= 25) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.isFile()) {
            try {
              const content = fs.readFileSync(full, 'utf-8');
              if (regex.test(content)) {
                results.push({ file: full, fileName: e.name });
              }
            } catch (_) {}
          }
        }
      }
      walk(basePath);
      return { success: true, totalMatches: results.length, results };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('read-file-content', async (_event, { path: filePath }: any) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return { error: 'File not found' };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('pick-and-read-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled) return [];
    return filePaths.map((fp) => {
      let content = '';
      try { content = fs.readFileSync(fp, 'utf-8'); } catch (_) {}
      return { name: path.basename(fp), path: fp, content };
    });
  });

  ipcMain.handle('pick-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('save-image', async (_event, { base64Data }: any) => {
    try {
      const filePath = path.join(app.getPath('downloads'), `akki_ai_${Date.now()}.png`);
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (error: any) {
      throw error;
    }
  });

  ipcMain.handle('save-image-file', async (_event, dataOrObj: any, filenameParam?: string) => {
    const base64Data = typeof dataOrObj === 'object' ? (dataOrObj?.base64Data || dataOrObj?.data || '') : String(dataOrObj || '');
    const customName = typeof dataOrObj === 'object' ? dataOrObj?.filename : filenameParam;
    const fileName = customName || `akki_ai_${Date.now()}.png`;
    const filePath = path.join(app.getPath('downloads'), fileName);
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  ipcMain.handle('http-fetch', async (_event, { url, method, headers, body }: any) => {
    try {
      const res = await fetch(url, {
        method: method || 'GET',
        headers: headers || {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.text();
      return { success: res.ok, status: res.status, data };
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-detailed-system-info', async () => {
    return {
      os: { platform: process.platform, arch: process.arch, release: os.release() },
      cpu: { cpus: os.cpus().length, model: os.cpus()[0]?.model || 'CPU' },
      mem: { total: os.totalmem(), free: os.freemem() },
    };
  });

  ipcMain.handle('clipboard-read', async () => {
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML(),
    };
  });

  ipcMain.handle('clipboard-write', async (_event, { text, html }: any) => {
    if (text) clipboard.writeText(text);
    if (html) clipboard.writeHTML(html);
    return { success: true };
  });

  ipcMain.handle('get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
    } catch (e: any) {
      return [];
    }
  });

  ipcMain.handle('send-notification', async (_event, { title, body }: any) => {
    new Notification({ title: title || 'Akki AI', body: body || '' }).show();
    return { success: true };
  });

  ipcMain.handle('open-external-link', async (_event, urlOrObj: any) => {
    const url = typeof urlOrObj === 'string' ? urlOrObj : urlOrObj?.url;
    if (url) await shell.openExternal(url);
    return true;
  });

  // ── 17. Arduino Channel Aliases ───────────────────────────────────────────
  ipcMain.handle('arduino-list-ports', async () => hardwareService.listPorts());
  ipcMain.handle('arduino-connect', async (_event, { port }: any = {}) => hardwareService.connect(port || 'COM3'));
  ipcMain.handle('arduino-disconnect', async () => hardwareService.disconnect());
  ipcMain.handle('arduino-digital-write', async (_event, { pin, value }: any) => hardwareService.digitalWrite(pin, value));
  ipcMain.handle('arduino-digital-read', async (_event, { pin }: any) => ({ pin, value: 0 }));
  ipcMain.handle('arduino-analog-write', async (_event, { pin, value }: any) => hardwareService.digitalWrite(pin, value));
  ipcMain.handle('arduino-analog-read', async (_event, { pin }: any) => hardwareService.analogRead(pin));
  ipcMain.handle('arduino-servo-write', async (_event, { pin, angle }: any) => hardwareService.servoWrite(pin, angle));
  ipcMain.handle('arduino-set-pin-mode', async () => ({ success: true }));
  ipcMain.handle('arduino-board-status', async () => ({ isConnected: hardwareService.isConnected() }));
  ipcMain.handle('arduino-led-blink', async () => ({ success: true }));
  ipcMain.handle('arduino-led-stop', async () => ({ success: true }));

  // ── 18. WhatsApp Channel Aliases ──────────────────────────────────────────
  ipcMain.handle('whatsapp-get-state', () => whatsAppManager.getState());
  ipcMain.handle('whatsapp-init', async () => whatsAppManager.initialize());
  ipcMain.handle('whatsapp-logout', async () => whatsAppManager.logout());
  ipcMain.handle('whatsapp-send-reply', async (_event, { to, message }: any) => whatsAppManager.sendReply(to, message));
  ipcMain.handle('send-whatsapp-keyboard', async (_event, args: any) => {
    try {
      const name = String(args?.name || '').trim();
      const message = String(args?.message || '').replace(/[\r\n]+/g, ' ').trim();

      if (!name || !message) {
        console.error('[WhatsApp Robot] Missing name or message:', { name, message });
        return { success: false, error: 'Contact name and message are required' };
      }

      const loadRobot = () => require('@jitsi/robotjs');

      if (process.platform === 'darwin') {
        const { isMac } = require('../services/platform-utils');
        if (isMac) {
          let robot: any;
          try {
            robot = loadRobot();
          } catch (e: any) {
            return { success: false, error: 'RobotJS not available on macOS.' };
          }
          const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          try { robot.setKeyboardDelay(12); } catch (_) {}
          try {
            await new Promise((resolve) => {
              exec('osascript -e \'tell application "WhatsApp" to activate\'', { timeout: 10000 }, () => resolve(true));
            });
          } catch (_) {}
          await sleep(3000);
          robot.keyTap('f', 'command');
          await sleep(800);
          robot.keyTap('a', 'command');
          await sleep(200);
          robot.keyTap('backspace');
          await sleep(300);
          robot.typeString(name);
          await sleep(2500);
          robot.keyTap('enter');
          await sleep(1500);
          robot.typeString(message);
          await sleep(800);
          robot.keyTap('enter');
          await sleep(300);
          return { success: true, output: 'Message sent successfully using RobotJS (macOS)', method: 'robotjs_mouse_mac' };
        }
      }

      let robot: any;
      try {
        robot = loadRobot();
      } catch (error: any) {
        console.error('[WhatsApp Robot] RobotJS not available:', error?.message);
        return { success: false, error: 'RobotJS module not installed. Run: npm install @jitsi/robotjs' };
      }

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      try { robot.setKeyboardDelay(12); } catch (_) {}

      // 1. Bring WhatsApp Desktop to the foreground.
      exec('start whatsapp:', (error) => {
        if (error) console.warn('[WhatsApp Robot] Could not open via protocol:', error.message);
      });

      // 2. Give it a cold-start window.
      await sleep(7000);

      // 3. Open chat search (Ctrl+F) and clear.
      robot.keyTap('f', 'control');
      await sleep(1800);
      robot.keyTap('a', 'control');
      await sleep(200);
      robot.keyTap('backspace');
      await sleep(400);

      // 4. Type the contact name and let search results settle.
      robot.typeString(name);
      await sleep(2500);

      // 5. Open the first match.
      robot.keyTap('enter');
      await sleep(1800);

      // 6. Type the message and send.
      robot.typeString(message);
      await sleep(1000);
      robot.keyTap('enter');
      await sleep(400);

      return {
        success: true,
        output: 'Message sent successfully using RobotJS',
        method: 'robotjs_native',
      };
    } catch (error: any) {
      console.error(error);
      return { success: false, error: error?.message };
    }
  });

  ipcMain.handle('keyboard-press', async (_event, { key }: any = {}) => {
    const startTime = Date.now();
    try {
      let robot: any;
      try {
        robot = require('@jitsi/robotjs');
      } catch (_error: any) {
        return {
          success: false,
          toolName: 'keyboard_press',
          error: 'RobotJS module not available. Keyboard control requires @jitsi/robotjs.',
          errorCode: 'MODULE_NOT_AVAILABLE',
          errorCategory: 'config',
          retryable: false,
          debugInfo: { executionTimeMs: Date.now() - startTime },
        };
      }

      const lowerKey = String(key || '').toLowerCase().trim();
      if (lowerKey.includes('+')) {
        const parts = lowerKey.split('+');
        const mainKey = parts.pop()!;
        const modifiers = parts;
        const modMap: Record<string, string> = { ctrl: 'control', alt: 'alt', shift: 'shift', cmd: 'command', win: 'command' };
        const robotModifiers = modifiers.map((modifier) => modMap[modifier] || modifier);

        robot.keyTap(mainKey, robotModifiers);
        console.log(`[Keyboard] Pressed: ${robotModifiers.join('+')}+${mainKey}`);
        return {
          success: true,
          toolName: 'keyboard_press',
          result: `Pressed ${key}`,
          debugInfo: { executionTimeMs: Date.now() - startTime },
        };
      }

      const keyMap: Record<string, string> = {
        enter: 'enter',
        return: 'enter',
        tab: 'tab',
        escape: 'escape',
        esc: 'escape',
        backspace: 'backspace',
        delete: 'delete',
        space: 'space',
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
        home: 'home',
        end: 'end',
        pageup: 'pageup',
        pagedown: 'pagedown',
        f1: 'f1',
        f2: 'f2',
        f3: 'f3',
        f4: 'f4',
        f5: 'f5',
        f6: 'f6',
        f7: 'f7',
        f8: 'f8',
        f9: 'f9',
        f10: 'f10',
        f11: 'f11',
        f12: 'f12',
        printscreen: 'printscreen',
        insert: 'insert',
        capslock: 'capslock',
        numlock: 'numlock',
        scrolllock: 'scrolllock',
      };

      const robotKey = keyMap[lowerKey] || lowerKey;
      robot.keyTap(robotKey);
      console.log(`[Keyboard] Pressed: ${robotKey}`);

      return {
        success: true,
        toolName: 'keyboard_press',
        result: `Pressed ${key}`,
        debugInfo: { executionTimeMs: Date.now() - startTime },
      };
    } catch (error: any) {
      console.error('[Keyboard] Press failed:', error?.message);
      return {
        success: false,
        toolName: 'keyboard_press',
        error: `Key press failed: ${error?.message}`,
        errorCode: 'UNKNOWN_ERROR',
        errorCategory: 'transient',
        retryable: true,
        retrySuggestion: 'Make sure the target window is focused and try again.',
        debugInfo: { executionTimeMs: Date.now() - startTime, key },
      };
    }
  });

  ipcMain.handle('keyboard-type', async (_event, { text, pressEnter }: any = {}) => {
    const startTime = Date.now();
    try {
      let robot: any;
      try {
        robot = require('@jitsi/robotjs');
      } catch (_error: any) {
        return {
          success: false,
          toolName: 'simulate_keyboard_press',
          error: 'RobotJS module not available. Keyboard control requires @jitsi/robotjs.',
          errorCode: 'MODULE_NOT_AVAILABLE',
          errorCategory: 'config',
          retryable: false,
          debugInfo: { executionTimeMs: Date.now() - startTime },
        };
      }

      if (text && text.length > 0) {
        robot.typeString(text);
        console.log(`[Keyboard] Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" (${text.length} chars)`);
      }

      if (pressEnter) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        robot.keyTap('enter');
        console.log('[Keyboard] Pressed Enter after typing');
      }

      return {
        success: true,
        toolName: 'simulate_keyboard_press',
        result: `Typed "${text}"${pressEnter ? ' and pressed Enter' : ''}`,
        data: { charCount: text?.length || 0, enterPressed: !!pressEnter },
        debugInfo: { executionTimeMs: Date.now() - startTime },
      };
    } catch (error: any) {
      console.error('[Keyboard] Type failed:', error?.message);
      return {
        success: false,
        toolName: 'simulate_keyboard_press',
        error: `Typing failed: ${error?.message}`,
        errorCode: 'UNKNOWN_ERROR',
        errorCategory: 'transient',
        retryable: true,
        retrySuggestion: 'Make sure the target input is focused. Try clicking on it first, then type.',
        debugInfo: { executionTimeMs: Date.now() - startTime, textLength: text?.length },
      };
    }
  });

  ipcMain.handle('get-whatsapp-settings', () => ctx.genericStore.get()['whatsapp_settings'] || {});
  ipcMain.handle('save-whatsapp-settings', (_event, settings: any) => {
    ctx.genericStore.update(c => ({ ...c, whatsapp_settings: settings }));
    return true;
  });

  // ── 19. Media & Info Panel Aliases ────────────────────────────────────────
  ipcMain.handle('play-youtube-video', async (_event, queryOrObj: any = {}) => {
    const query = typeof queryOrObj === 'string' ? queryOrObj : (queryOrObj?.query || queryOrObj?.url || 'lofi beats');
    return await ctx.toolRegistry.execute('play_youtube_video', { query });
  });
  ipcMain.handle('control-media-player', (_event, { action, data }: any) => ({ success: true, action, data }));
  ipcMain.handle('open-info-panel', async (_event, payload: any) => {
    const panelId = payload?.panelId || payload?.id || 'market_summary';
    const title = payload?.title || 'System Information';
    const theme = (['cyan', 'amber', 'crimson', 'emerald', 'blue'].includes(payload?.theme || payload?.color) ? (payload?.theme || payload?.color) : 'cyan') as any;
    const content = payload?.content || payload?.body || '';
    await ctx.infoPanelManager.openPanel({ panelId, title, theme, content });
    return true;
  });
  ipcMain.handle('close-info-panel', (_event, panelId?: string) => ctx.infoPanelManager.closePanel(panelId || 'market_summary'));
  ipcMain.handle('get-info-panel-data', (_event, panelId?: string) => ctx.infoPanelManager.getPanelData(panelId || 'market_summary'));
  ipcMain.handle('open-widget-window', async () => ({ success: true, id: 'widget-main' }));
  ipcMain.handle('close-widget-window', () => true);

  // ── 20. Agent Town & Hermes Handlers ──────────────────────────────────────
  ipcMain.handle('agent-report-add', (_event, report: any) => ({ success: true, report }));
  ipcMain.handle('agent-reports-mark-delivered', () => true);
  ipcMain.handle('agent-reports-recent', () => []);
  ipcMain.handle('agent-reports-undelivered', () => []);
  ipcMain.handle('get-sub-agent-config', async () => {
    try {
      const p = getUserDataPath('sub_agent_config.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          enabled: Boolean(data?.enabled),
          modelId: String(data?.modelId || ''),
        };
      }
    } catch {}
    return { enabled: false, modelId: '' };
  });

  ipcMain.handle('save-sub-agent-config', async (_event, config: any) => {
    try {
      const normalized = {
        enabled: Boolean(config?.enabled),
        modelId: String(config?.modelId || '').trim(),
        updatedAt: Date.now(),
      };
      const p = getUserDataPath('sub_agent_config.json');
      fs.writeFileSync(p, JSON.stringify(normalized, null, 2), 'utf8');
      ctx.genericStore.update(c => ({ ...c, sub_agent_config: normalized }));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-agent-town-config', async () => {
    try {
      const p = getUserDataPath('agent_town_config.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return {
      provider: 'gemini',
      apiKey: '',
      geminiApiKey: '',
      openRouterApiKey: '',
      modelId: 'gemini-3.1-flash-lite',
    };
  });

  ipcMain.handle('save-agent-town-config', async (_event, config: any) => {
    try {
      const normalized = {
        provider:
          config?.provider === 'openrouter'
            ? 'openrouter'
            : config?.provider === 'openai-codex'
              ? 'openai-codex'
              : 'gemini',
        apiKey: String(config?.apiKey || '').trim(),
        geminiApiKey: String(config?.geminiApiKey || config?.apiKey || '').trim(),
        openRouterApiKey: String(config?.openRouterApiKey || '').trim(),
        modelId: String(config?.modelId || '').trim(),
        updatedAt: Date.now(),
      };
      const p = getUserDataPath('agent_town_config.json');
      fs.writeFileSync(p, JSON.stringify(normalized, null, 2), 'utf8');
      ctx.genericStore.update(c => ({ ...c, agent_town_config: normalized }));
      if (normalized.modelId) {
        ctx.agentCoordinator.setActiveModel(normalized.modelId);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('start-agent-town-server', async () => {
    try {
      const { startAgentTownServer } = await import('../services/agents/agent-town-server-service');
      const port = await startAgentTownServer(3000);
      return { success: !!port, port };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-agent-town-status', async () => {
    try {
      const { isServerReady, getServerUrl } = await import('../services/agents/agent-town-server-service');
      return { ready: isServerReady(), url: getServerUrl() };
    } catch {
      return { ready: false, url: null };
    }
  });
  ipcMain.handle('get-hermes-insights', () => ({}));
  ipcMain.handle('get-hermes-memory', () => ctx.memoryService.readRawMemory());
  ipcMain.handle('get-hermes-skills', () => ctx.skillsService.listSkills());

  // ── 21. Paths, Preferences, Updates & Misc ────────────────────────────────
  ipcMain.handle('get-akki-data-path', () => path.join(app.getPath('documents'), 'Akki Data'));
  ipcMain.handle('get-desktop-path', () => app.getPath('desktop'));
  ipcMain.handle('get-documents-path', () => app.getPath('documents'));
  ipcMain.handle('get-downloads-path', () => app.getPath('downloads'));
  ipcMain.handle('get-notes-path', () => path.join(app.getPath('userData'), 'notes'));
  ipcMain.handle('get-stonic-data-path', () => path.join(app.getPath('documents'), 'Akki Data'));
  ipcMain.handle('get-image-output-path', () => ctx.genericStore.get()['image_output_path'] || app.getPath('downloads'));
  ipcMain.handle('save-image-output-path', (_event, val: string) => {
    ctx.genericStore.update(c => ({ ...c, image_output_path: val }));
    return true;
  });
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-user-location', () => 'India');
  ipcMain.handle('get-google-photo-url', () => null);
  ipcMain.handle('get-stored-user', () => null);
  ipcMain.handle('get-openrouter-models', () => ({ data: [{ id: 'anthropic/claude-3.5-sonnet' }, { id: 'meta-llama/llama-3.3-70b-instruct' }] }));
  
  ipcMain.handle('get-custom-models', async () => {
    try {
      const p = getUserDataPath('custom_models.json');
      if (fs.existsSync(p)) {
        const saved = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          openRouter: Array.isArray(saved?.openRouter) ? saved.openRouter : [],
          gemini: Array.isArray(saved?.gemini) ? saved.gemini : [],
          openai: Array.isArray(saved?.openai) ? saved.openai : [],
        };
      }
    } catch {}
    return { openRouter: [], gemini: [], openai: [] };
  });

  ipcMain.handle('save-custom-models', async (_event, models: any) => {
    try {
      const normalizedModels = {
        openRouter: Array.isArray(models?.openRouter) ? models.openRouter : [],
        gemini: Array.isArray(models?.gemini) ? models.gemini : [],
        openai: Array.isArray(models?.openai) ? models.openai : [],
      };
      const p = getUserDataPath('custom_models.json');
      fs.writeFileSync(p, JSON.stringify(normalizedModels, null, 2), 'utf8');
      ctx.genericStore.update(c => ({ ...c, custom_models: normalizedModels }));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-tools-config', async () => {
    try {
      return readToolsConfig();
    } catch (err: any) {
      console.error('[IPC:get-tools-config] Error:', err?.message);
      return DEFAULT_TOOLS_CONFIG;
    }
  });

  ipcMain.handle('save-tools-config', async (_event, config: any) => {
    try {
      const ok = writeToolsConfig(config);
      ctx.genericStore.update(c => ({ ...c, tools_config: config }));
      return { success: ok };
    } catch (err: any) {
      console.error('[IPC:save-tools-config] Error:', err?.message);
      return { success: false, error: err?.message };
    }
  });

  ipcMain.handle('gemini-speak', async (_event, payload: { text: string; voice?: string }) => {
    try {
      const apiKey = getSecretKeyFromDiskOrStore();
      if (!apiKey) return { success: false, error: 'No Gemini API key configured' };

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const voiceName = payload?.voice || 'Aoede';

      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Speak warmly and naturally in Hindi: ${payload.text}` }],
            },
          ],
        });
      } catch {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Speak warmly and naturally in Hindi: ${payload.text}` }],
            },
          ],
        });
      }

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      if (part && (part as any).inlineData) {
        const inlineData = (part as any).inlineData;
        return {
          success: true,
          audioData: inlineData.data,
          mimeType: inlineData.mimeType || 'audio/wav',
        };
      }
      return { success: false, error: 'No audio returned' };
    } catch (err: any) {
      console.warn('[IPC:gemini-speak] Voice generation failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-thinking-enabled', async () => {
    try {
      const p = getUserDataPath('thinking_settings.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data?.enabled !== undefined ? Boolean(data.enabled) : true;
      }
    } catch {}
    return true;
  });

  ipcMain.handle('save-thinking-enabled', async (_event, val: any) => {
    try {
      const enabled = typeof val === 'object' ? Boolean(val?.enabled) : Boolean(val);
      const p = getUserDataPath('thinking_settings.json');
      fs.writeFileSync(p, JSON.stringify({ enabled, updatedAt: Date.now() }, null, 2), 'utf8');
      ctx.genericStore.update(c => ({ ...c, thinking_enabled: enabled }));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-voice-provider', () => ctx.genericStore.get()['voice_provider'] || 'browser');
  ipcMain.handle('save-voice-provider', (_event, val: string) => {
    ctx.genericStore.update(c => ({ ...c, voice_provider: val }));
    return true;
  });
  ipcMain.handle('get-auto-update-enabled', () => getAutoUpdateEnabled());
  ipcMain.handle('save-auto-update-enabled', (_event, enabledOrObj: any) => {
    const enabled = typeof enabledOrObj === 'object' ? (enabledOrObj?.enabled !== false) : (enabledOrObj !== false);
    return setAutoUpdateEnabled(enabled);
  });
  ipcMain.handle('check-for-updates', () => checkForUpdates(getMainWindow));
  ipcMain.handle('download-update', () => downloadUpdate());
  ipcMain.handle('install-update', () => installUpdate(getMainWindow));

  ipcMain.handle('load-chats', () => ctx.chatsStore.get());
  ipcMain.handle('save-chats', (_event, chats: any) => {
    if (Array.isArray(chats)) ctx.chatsStore.set(chats);
    return true;
  });
  ipcMain.handle('load-imported-folders', () => []);
  ipcMain.handle('save-imported-folders', () => true);
  ipcMain.handle('read-bootstrap-files', () => []);
  ipcMain.handle('read-raw-memory', () => ctx.memoryService.readRawMemory());

  ipcMain.handle('skills-get-all', () => ctx.skillsService.listSkills());
  ipcMain.handle('skills-load-content', async (_event, payload: any) => {
    const folderName = typeof payload === 'string' ? payload : (payload?.folderName || payload?.skillName || '');
    if (folderName && ctx.skillsService.loadSkillContent) {
      return ctx.skillsService.loadSkillContent(folderName);
    }
    return '';
  });

  ipcMain.handle('refresh-available-models', async (_event, params?: { provider?: string; apiKey?: string }) => {
    try {
      if (params?.provider === 'openrouter') {
        const models = await fetchOpenRouterModels();
        return { success: true, models };
      }
      if (params?.provider === 'gemini') {
        let finalKey = params.apiKey || '';
        if (!finalKey) {
          finalKey = getSecretKeyFromDiskOrStore();
        }
        const models = await fetchGeminiModels(finalKey);
        return { success: true, models };
      }
    } catch (e: any) {
      console.warn('[IPC:refresh-available-models] Provider fetch warning:', e?.message);
    }

    const customPath = getUserDataPath('custom_models.json');
    let customModels: any = { openRouter: [], gemini: [], openai: [] };
    if (fs.existsSync(customPath)) {
      try { customModels = JSON.parse(fs.readFileSync(customPath, 'utf8')); } catch {}
    }

    const defaultGemini = [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ];
    const defaultOpenRouter = [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Free' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
    ];

    return {
      success: true,
      gemini: [...defaultGemini, ...(customModels.gemini || [])],
      openRouter: [...defaultOpenRouter, ...(customModels.openRouter || [])],
      openai: customModels.openai || [],
      models: defaultGemini.map((m) => m.id),
    };
  });

  ipcMain.handle('fetch-dashboard-data', async () => {
    const tasks = ctx.tasksStore.get();
    const notes = ctx.notesStore.get();
    const chats = ctx.chatsStore.get();
    return {
      success: true,
      activeTasks: tasks.filter((t) => t.status === 'in_progress').length,
      totalTasks: tasks.length,
      notesCount: notes.length,
      chatsCount: chats.length,
      systemStatus: 'nominal',
      timestamp: Date.now(),
    };
  });

  ipcMain.handle('license-get-hardware-id', () => generateHardwareId());
  ipcMain.handle('license-get-status', () => getLicenseStatus());
  ipcMain.handle('license-is-blocked', () => isLicenseBlocked());
  ipcMain.handle('license-monitor-status', () => ({ ok: !isLicenseBlocked() }));
  ipcMain.handle('license-open-whatsapp', async (_event, params?: any) => {
    const hwId = generateHardwareId();
    const session = await firebaseService.getStoredSession();
    const email = params?.email || session?.user?.email || '(Not Logged In)';
    const text = `Hello Akki Ai Support,\n\nPlease activate my account:\nEmail: ${email}\nHardware ID: ${hwId}`;
    const url = `https://wa.me/919732004563?text=${encodeURIComponent(text)}`;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('license-submit-payment', async (_event, payload: any) => {
    const hwId = generateHardwareId();
    const session = await firebaseService.getStoredSession();
    const email = payload?.email || session?.user?.email;
    const plan = payload?.plan || 'pro';
    savePendingLicense({
      email,
      plan,
      hardwareId: hwId,
    });
    return { success: true, message: 'Payment submitted for verification' };
  });
  ipcMain.handle('license-passed', () => isEffectiveLicensed());

  const getUserProfilePath = () => path.join(app.getPath('userData'), 'user_profile.json');

  const updateUserProfile = (patch: Record<string, any>) => {
    try {
      const p = getUserProfilePath();
      let current: Record<string, any> = {};
      if (fs.existsSync(p)) {
        try {
          current = JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch (_) {}
      }
      const updated = { ...current, ...patch, updatedAt: Date.now() };
      fs.writeFileSync(p, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (e) {
      console.error('[IPC] Failed to persist user_profile.json:', e);
      return null;
    }
  };

  ipcMain.handle('save-user-profile', async (_event, profile: Record<string, any>) => {
    const updated = updateUserProfile(profile || {});
    return { success: !!updated, profile: updated };
  });

  ipcMain.handle('get-user-profile', async () => {
    try {
      const p = getUserProfilePath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
      return null;
    } catch (_) {
      return null;
    }
  });

  ipcMain.handle('onboarding-get-data', () => {
    try {
      const p = getUserProfilePath();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch (_) {}
    return {};
  });
  ipcMain.handle('onboarding-get-mode', () => 'standard');
  ipcMain.handle('onboarding-save-age', (_event, age) => {
    updateUserProfile({ age });
    return true;
  });
  ipcMain.handle('onboarding-save-name', (_event, name) => {
    updateUserProfile({ name });
    return true;
  });
  ipcMain.handle('onboarding-sign-in', () => true);
  ipcMain.handle('splash-transition-complete', () => true);

  ipcMain.handle('auth-get-status', () => ({ signedIn: true }));
  ipcMain.handle('auth-sign-in', () => true);
  ipcMain.handle('auth-sign-out', () => true);
  ipcMain.handle('get-codex-auth-status', () => false);
  ipcMain.handle('register-vertex-token', () => true);
  ipcMain.handle('validate-huggingface-token', () => true);
  ipcMain.handle('reauth-complete', () => true);
  ipcMain.handle('remote-access-status', () => ({ enabled: false }));
  ipcMain.handle('initialize-vault', () => true);
  ipcMain.handle('open-vault-folder', () => true);
  
  // ── Setup Walkthrough Guide Popup (GuideModal / 5-step Quick Setup Guide) ──
  const markGuideSeen = async () => {
    try {
      const payload = JSON.stringify({ seen: true, at: Date.now() }, null, 2);
      fs.writeFileSync(getUserDataPath('guide_seen.json'), payload, 'utf8');
      fs.writeFileSync(getUserDataPath('setup_guide_seen.json'), payload, 'utf8');
      return true;
    } catch {
      return false;
    }
  };

  const shouldShowGuide = async () => {
    try {
      const p1 = getUserDataPath('guide_seen.json');
      const p2 = getUserDataPath('setup_guide_seen.json');
      return !fs.existsSync(p1) && !fs.existsSync(p2);
    } catch {
      return true;
    }
  };

  ipcMain.handle('guide-mark-seen', markGuideSeen);
  ipcMain.handle('guide-should-show', shouldShowGuide);
  ipcMain.handle('setup-guide-mark-seen', markGuideSeen);
  ipcMain.handle('setup-guide-should-show', shouldShowGuide);

  ipcMain.handle('open-neural-browser', () => true);
  ipcMain.handle('launch-browser-login-session', () => true);

  // ── 22. Legacy Preferences Handlers ───────────────────────────────────────
  ipcMain.handle('get-wake-word-enabled', () => {
    try {
      const p = getUserDataPath('wake_word_settings.json');
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        return d?.enabled === true;
      }
    } catch {}
    return false;
  });
  ipcMain.handle('set-wake-word-enabled', (_event, enabledOrObj: any) => {
    try {
      const enabled = typeof enabledOrObj === 'object' ? Boolean(enabledOrObj?.enabled) : Boolean(enabledOrObj);
      const p = getUserDataPath('wake_word_settings.json');
      fs.writeFileSync(p, JSON.stringify({ enabled, updatedAt: Date.now() }, null, 2), 'utf8');
      return true;
    } catch {}
    return false;
  });
  
  ipcMain.handle('get-prefer-direct-gemini', async () => {
    try {
      const p = getUserDataPath('gemini_preference.json');
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data?.preferDirect !== undefined ? Boolean(data.preferDirect) : false;
      }
    } catch {}
    return false;
  });

  ipcMain.handle('save-prefer-direct-gemini', async (_event, value: any) => {
    try {
      const preferDirect = typeof value === 'object' ? Boolean(value?.preferDirect) : Boolean(value);
      const p = getUserDataPath('gemini_preference.json');
      fs.writeFileSync(p, JSON.stringify({ preferDirect, updatedAt: Date.now() }, null, 2), 'utf8');
      ctx.genericStore.update((current) => ({ ...current, preferDirectGemini: preferDirect }));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-voice-assistant-mode', () => {
    return ctx.genericStore.get()['voiceAssistantMode'] || 'normal';
  });
  ipcMain.handle('save-voice-assistant-mode', (_event, value: string) => {
    ctx.genericStore.update((current) => ({ ...current, voiceAssistantMode: value }));
    return true;
  });

  const getThemePath = () => path.join(app.getPath('userData'), 'theme.json');

  ipcMain.handle('get-theme', async () => {
    try {
      const p = getThemePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data === 'string') return data;
        if (data && typeof data.theme === 'string' && data.theme.trim().length > 0) {
          return data.theme;
        }
      }
    } catch (e) {
      console.warn('[IPC] Error reading theme.json:', e);
    }
    return (ctx.settingsStore.get().theme as string) || (ctx.genericStore.get()['theme'] as string) || 'cyberpunk-dark';
  });

  ipcMain.handle('set-theme', async (_event, themeId: string) => {
    try {
      if (!themeId || typeof themeId !== 'string') return false;
      const p = getThemePath();
      const payload = {
        theme: themeId,
        updatedAt: new Date().toISOString(),
      };
      const tempPath = `${p}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, p);

      ctx.settingsStore.update((curr) => ({
        ...curr,
        theme: themeId as any,
      }));
      ctx.genericStore.update((curr) => ({
        ...curr,
        theme: themeId,
      }));
      return true;
    } catch (e) {
      console.error('[IPC] Failed to save theme.json:', e);
      try {
        fs.writeFileSync(getThemePath(), JSON.stringify({ theme: themeId, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
        return true;
      } catch {
        return false;
      }
    }
  });

  ipcMain.handle('get-system-paths', () => {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      home: app.getPath('home'),
      temp: app.getPath('temp'),
      documents: app.getPath('documents'),
      logs: app.getPath('logs'),
      desktop: app.getPath('desktop'),
      downloads: app.getPath('downloads')
    };
  });

  const getHistoryPath = () => path.join(app.getPath('userData'), 'history.json');
  ipcMain.handle('save-history', (_event, data: any) => {
    try {
      fs.writeFileSync(getHistoryPath(), JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('load-history', () => {
    try {
      const p = getHistoryPath();
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
    return [];
  });
  ipcMain.handle('clear-history', () => {
    try {
      const p = getHistoryPath();
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('auth-save', (_event, data: any) => {
    return authCredentialStore.saveCredential(typeof data === 'string' ? data : JSON.stringify(data));
  });
  ipcMain.handle('auth-get-stored', () => {
    const raw = authCredentialStore.loadCredential();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  });
  ipcMain.handle('auth-delete', () => {
    return authCredentialStore.deleteCredential();
  });

  if (typeof (ipcMain as any).on === 'function') {
    (ipcMain as any).on('license-check', (event: any) => { event.returnValue = true; });
  }
  ipcMain.handle('license-activate', () => true);
  ipcMain.handle('license-deactivate', () => true);
  ipcMain.handle('license-status', () => true);

  ipcMain.handle('onboarding-status', () => true);
  ipcMain.handle('onboarding-complete', () => true);
}

