import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { configureCsp } from './security/csp';

// CRITICAL ISOLATION SAFEGUARD:
// Ensure 100% isolation from any existing or legacy installed Akki AI application.
// All cache, local storage, indexedDB, and config will be stored strictly in AppData/Roaming/AkkiAiFresh.
try {
  const isolatedUserData = path.join(app.getPath('appData'), 'AkkiAiFresh');
  app.setPath('userData', isolatedUserData);
} catch (e) {
  console.warn('[AkkiAI] Using default userData path:', e);
}

import { ensureAkkiDirectories } from './services/storage/paths';
import { createMainWindow, getMainWindow } from './windows/main-window';
import { InfoPanelWindowManager } from './windows/info-panel-window';
import { LocalStore } from './services/storage/local-store';
import { MemoryService } from './services/memory/memory-service';
import { ToolRegistry } from './services/tools/tool-registry';
import { AIService } from './services/ai/ai-service';
import { AgentCoordinator } from './services/agents/agent-coordinator';
import { startAgentTownServer, stopAgentTownServer } from './services/agents/agent-town-server-service';
import * as hermesBridgeService from './services/agents/hermes-bridge-service';
import { registerIpcHandlers } from './ipc/register-handlers';
import { SkillsService } from './services/skills/skills-service';
import { firebaseService } from './services/auth/firebase-service';
import { setupAutoUpdater } from './services/auto-updater';
import { bootstrapMacPermissions } from './services/macos-permissions';
import type {
  TaskItem,
  NoteItem,
  ChatMessage,
  AppSettings,
} from '../shared/types';

// Default Storage Fixtures
const DEFAULT_SETTINGS: AppSettings = {
  primaryModel: 'gemini-2.5-flash',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openRouterApiKey: '',
  huggingFaceApiKey: '',
  picovoiceAccessKey: '',
  wakeWordEnabled: false,
  voiceProvider: 'browser',
  voiceAssistantMode: 'voice',
  selectedPersona: 'caring_companion',
  customSystemPrompt: '',
  theme: 'violet-void',
  soundEffectsEnabled: true,
  bgmEnabled: false,
};

const DEFAULT_TASKS: TaskItem[] = [];
const DEFAULT_NOTES: NoteItem[] = [];
const DEFAULT_CHATS: ChatMessage[] = [];

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[AkkiAI] Another instance is already running. Exiting.');
  app.quit();
} else {
  let infoPanelManager: InfoPanelWindowManager | null = null;

  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    // 1. Security & CSP Configuration
    configureCsp();
    bootstrapMacPermissions();

    // 2. Service Layer Instantiation
    ensureAkkiDirectories(app);
    firebaseService.initFirebase();
    const memoryService = new MemoryService();
    infoPanelManager = new InfoPanelWindowManager();
    const agentCoordinator = new AgentCoordinator();
    const skillsService = new SkillsService();

    const tasksStore = new LocalStore<TaskItem[]>('tasks.json', DEFAULT_TASKS);
    const notesStore = new LocalStore<NoteItem[]>('notes.json', DEFAULT_NOTES);
    const chatsStore = new LocalStore<ChatMessage[]>('chats.json', DEFAULT_CHATS);
    const settingsStore = new LocalStore<AppSettings>('settings.json', DEFAULT_SETTINGS);
    const genericStore = new LocalStore<Record<string, unknown>>('general.json', {});

    // Import legacy keys/profile/license from AppData/Roaming/Akki Ai if present & clean video files
    try {
      const legacyDir = path.join(app.getPath('appData'), 'Akki Ai');
      const currentDir = app.getPath('userData');
      const targetDirs = [currentDir];
      if (fs.existsSync(legacyDir) && legacyDir !== currentDir) {
        targetDirs.push(legacyDir);
      }

      // Purge any lingering legacy video files across both directories
      for (const dir of targetDirs) {
        try {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (/^(guide_)?(video|demo)/i.test(f)) {
              try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
            }
          }
          // Ensure setup_guide_seen.json and guide_seen.json
          const seenPayload = JSON.stringify({ seen: true, at: Date.now() }, null, 2);
          const sgPath = path.join(dir, 'setup_guide_seen.json');
          const gPath = path.join(dir, 'guide_seen.json');
          if (!fs.existsSync(sgPath)) fs.writeFileSync(sgPath, seenPayload, 'utf8');
          if (!fs.existsSync(gPath)) fs.writeFileSync(gPath, seenPayload, 'utf8');
        } catch (_) {}
      }

      if (fs.existsSync(legacyDir)) {
        const configs = [
          'secret_key.json',
          'openrouter_key.json',
          'hf_key.json',
          'auth_data.json',
          'agent_town_config.json',
          'sub_agent_config.json',
          'tools_config.json',
          'user_profile.json',
          'license.json',
          'firebase_session.json',
          'firebase_credential.bin',
          'theme.json',
          'voice_assistant_mode.json',
          'guide_seen.json',
          'setup_guide_seen.json',
        ];
        for (const file of configs) {
          const src = path.join(legacyDir, file);
          const dst = path.join(currentDir, file);
          if (fs.existsSync(src) && !fs.existsSync(dst)) {
            try { fs.copyFileSync(src, dst); } catch (_) {}
          } else if (fs.existsSync(src) && fs.existsSync(dst)) {
            try {
              const srcMtime = fs.statSync(src).mtimeMs;
              const dstMtime = fs.statSync(dst).mtimeMs;
              if (srcMtime > dstMtime) {
                fs.copyFileSync(src, dst);
              } else if (dstMtime > srcMtime) {
                fs.copyFileSync(dst, src);
              }
            } catch (_) {}
          }
        }
      }

      // Also seed from root workspace if present
      const rootSecret = path.join(app.getAppPath(), 'secret_key.json');
      const targetSecret = path.join(currentDir, 'secret_key.json');
      if (fs.existsSync(rootSecret) && !fs.existsSync(targetSecret)) {
        try { fs.copyFileSync(rootSecret, targetSecret); } catch (_) {}
      }
    } catch (_) {}

    // Resolve initial active API keys from disk files
    let initialGeminiKey = settingsStore.get().geminiApiKey || process.env.GEMINI_API_KEY || '';
    let initialOpenRouterKey = settingsStore.get().openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
    let initialHfKey = settingsStore.get().huggingFaceApiKey || process.env.HUGGINGFACE_API_KEY || '';

    try {
      const skPath = path.join(app.getPath('userData'), 'secret_key.json');
      if (fs.existsSync(skPath)) {
        const d = JSON.parse(fs.readFileSync(skPath, 'utf8'));
        const k = d?.data?.geminiKey || d?.apiKey || d?.geminiKey || d?.key;
        if (k && typeof k === 'string' && k.trim()) initialGeminiKey = k.trim();
        const hf = d?.data?.hfKey || d?.hfKey;
        if (hf && typeof hf === 'string' && hf.trim()) initialHfKey = hf.trim();
        const or = d?.data?.openrouterKey || d?.openrouterKey;
        if (or && typeof or === 'string' && or.trim()) initialOpenRouterKey = or.trim();
      }
    } catch (_) {}

    try {
      const atPath = path.join(app.getPath('userData'), 'agent_town_config.json');
      if (fs.existsSync(atPath)) {
        const d = JSON.parse(fs.readFileSync(atPath, 'utf8'));
        const k = d?.geminiApiKey || (d?.provider === 'gemini' ? d?.apiKey : '');
        if (k && typeof k === 'string' && k.trim() && !initialGeminiKey) initialGeminiKey = k.trim();
        const or = d?.openRouterApiKey || (d?.provider === 'openrouter' ? d?.apiKey : '');
        if (or && typeof or === 'string' && or.trim() && !initialOpenRouterKey) initialOpenRouterKey = or.trim();
      }
    } catch (_) {}

    // Update settingsStore with loaded keys and modern model
    settingsStore.update((current) => ({
      ...current,
      primaryModel: current.primaryModel || 'gemini-3.8-flash',
      geminiApiKey: initialGeminiKey || current.geminiApiKey,
      openRouterApiKey: initialOpenRouterKey || current.openRouterApiKey,
      huggingFaceApiKey: initialHfKey || current.huggingFaceApiKey,
    }));

    const toolRegistry = new ToolRegistry(memoryService, agentCoordinator, infoPanelManager);
    agentCoordinator.setToolRegistry(toolRegistry);
    const aiService = new AIService(
      initialGeminiKey,
      memoryService,
      toolRegistry,
      () => settingsStore.get()
    );
    if (initialOpenRouterKey) {
      aiService.setOpenRouterKey(initialOpenRouterKey);
    }
    agentCoordinator.setGeminiService(aiService);

    // 3. Register All Typed IPC Handlers
    registerIpcHandlers({
      tasksStore,
      notesStore,
      chatsStore,
      settingsStore,
      genericStore,
      memoryService,
      toolRegistry,
      aiService,
      agentCoordinator,
      infoPanelManager,
      skillsService,
    });

    // 4. Initialize Primary Electron Window
    createMainWindow();
    setupAutoUpdater({ getMainWindow });

    // 5. Start Agent Town Standalone Server (Phaser 3 simulation on port 3000)
    startAgentTownServer(3000)
      .then((port) => {
        if (port) {
          console.log(`[AkkiAI] Agent Town server live on port ${port}`);
        } else {
          console.warn('[AkkiAI] Agent Town server failed to start. Fallback canvas active.');
        }
      })
      .catch((err) => {
        console.error('[AkkiAI] Agent Town startup error:', err);
      });

    // 6. Start Hermes Bridge Gateway (OpenClaw protocol WebSocket server on port 18789)
    // hermesBridgeService.setAgentCoordinator(agentCoordinator);
    try { hermesBridgeService.startHermesBridge(app); } catch (err: any) {
      console.warn('[AkkiAI] Hermes bridge startup notice:', err.message);
    }

    console.log('[AkkiAI] Main process initialized successfully.');
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!getMainWindow()) {
      createMainWindow();
    }
  });

  app.on('before-quit', () => {
    if (infoPanelManager) {
      infoPanelManager.closeAllPanels();
    }
    stopAgentTownServer();
    hermesBridgeService.stopHermesBridge();
  });
}
