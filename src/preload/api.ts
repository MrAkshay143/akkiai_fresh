import { ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/contracts/ipc';
import type {
  TaskItem,
  NoteItem,
  ChatMessage,
  AppSettings,
  MemoryEntry,
  AgentTask,
  SubAgentState,
  InfoPanelPayload,
} from '../shared/types';

export interface ElectronAPI {
  // App & Window Controls
  getPaths: () => Promise<Record<string, string>>;
  getVersion: () => Promise<string>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  setZoomFactor?: (factor: number) => void;
  getZoomFactor?: () => number;
  notifyAppReady?: () => Promise<any>;
  installUpdate?: () => Promise<any>;
  checkForUpdates?: () => Promise<any>;
  send?: (channel: string, ...args: unknown[]) => void;
  on?: (channel: string, callback: (...args: any[]) => void) => () => void;
  getAuthStatus?: () => Promise<any>;
  signIn?: () => Promise<any>;
  signOut?: () => Promise<any>;
  onAuthStateChanged?: (callback: (user: any) => void) => () => void;

  // Storage
  storageGet: (key: string) => Promise<unknown>;
  storageSet: (key: string, value: unknown) => Promise<void>;
  loadTasks: () => Promise<TaskItem[]>;
  saveTasks: (tasks: TaskItem[]) => Promise<boolean>;
  loadNotes: () => Promise<NoteItem[]>;
  saveNotes: (notes: NoteItem[]) => Promise<boolean>;
  loadChats: () => Promise<ChatMessage[]>;
  saveChats: (chats: ChatMessage[]) => Promise<boolean>;
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;

  // Memory
  readRawMemory: () => Promise<string>;
  writeRawMemory: (content: string) => Promise<boolean>;
  writeMemoryEntry: (category: string, fact: string) => Promise<boolean>;
  deleteMemoryEntry: (id: string) => Promise<boolean>;
  optimizeMemory: () => Promise<{ status: string; count: number }>;
  getAllMemory: () => Promise<MemoryEntry[]>;

  // AI & Generation
  generateStream: (payload: {
    prompt: string;
    history?: ChatMessage[];
    options?: Record<string, unknown>;
  }) => Promise<string>;
  cancelStream: () => Promise<void>;
  generateImage: (prompt: string) => Promise<{ imageUrl: string }>;
  onStreamToken: (callback: (token: string) => void) => () => void;
  onToolResult: (callback: (result: any) => void) => () => void;

  // Tools
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<any>;
  listTools: () => Promise<{ name: string; description: string }[]>;

  // Agent Town
  assignAgentTask: (task: {
    agentName?: string;
    title: string;
    description: string;
  }) => Promise<AgentTask>;
  inspectAgentTask: (taskId: string) => Promise<AgentTask | undefined>;
  stopAgentTask: (taskId: string) => Promise<boolean>;
  listAgentTasks: () => Promise<AgentTask[]>;
  getAgentStates: () => Promise<SubAgentState[]>;

  // Native Info Panels
  openInfoPanel: (payload: InfoPanelPayload) => Promise<void>;
  closeInfoPanel: (panelId: string) => Promise<boolean>;
  getInfoPanelData: (panelId: string) => Promise<InfoPanelPayload | null>;

  // Media Player
  controlMedia: (action: string, data?: unknown) => Promise<unknown>;
  playYouTube: (url: string) => Promise<void>;

  // WhatsApp
  getWhatsAppStatus: () => Promise<{ connected: boolean; user?: string }>;
  startWhatsAppAuth: () => Promise<{ qrCode?: string; status: string }>;
  logoutWhatsApp: () => Promise<void>;
  sendWhatsAppMessage: (to: string, message: string) => Promise<boolean>;

  // Hardware
  listSerialPorts: () => Promise<any>;
  connectArduino: (port: string) => Promise<any>;
  disconnectArduino: () => Promise<any>;

  // Audio SFX
  playSfx: (soundName: string) => Promise<void>;

  // Keyboard automation
  keyboardPress?: (payload: { key: string }) => Promise<any>;
  keyboardType?: (payload: { text: string; pressEnter?: boolean }) => Promise<any>;

  // Generic invoker
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  saveUserProfile?: (profile: { name: string; age?: string | number }) => Promise<any>;
  getUserProfile?: () => Promise<any>;

  // Skills
  skillsList: () => Promise<any[]>;
  skillsToggle: (folderName: string, enabled: boolean, isCore: boolean) => Promise<boolean>;
  skillsSave: (data: { name: string; description: string; content: string; folderName: string; isCore: boolean; category?: string }) => Promise<boolean>;
  skillsDelete: (folderName: string, isCore: boolean) => Promise<boolean>;
  writeBootstrapFile: (filename: string, content: string) => Promise<boolean>;
  saveGeminiKey: (apiKey: string, voice: string) => Promise<boolean>;
  saveLlmSettings: (provider: string, modelId: string, openRouterKey: string) => Promise<boolean>;
  authCheckAccess: () => Promise<any>;
  authStartCallbackServer: () => Promise<any>;
  authLogoutDevice: () => Promise<any>;
  
  // Legacy
  getWakeWordEnabled: () => Promise<boolean>;
  setWakeWordEnabled: (enabled: boolean) => Promise<boolean>;
  getPreferDirectGemini: () => Promise<boolean>;
  savePreferDirectGemini: (value: boolean) => Promise<boolean>;
  getVoiceAssistantMode: () => Promise<string>;
  saveVoiceAssistantMode: (value: string) => Promise<boolean>;
  getTheme: () => Promise<string>;
  setTheme: (value: string) => Promise<boolean>;
  getSystemPaths: () => Promise<Record<string, string>>;
  saveHistory: (data: any) => Promise<boolean>;
  loadHistory: () => Promise<any[]>;
  clearHistory: () => Promise<boolean>;
  authSave: (data: any) => Promise<boolean>;
  authGetStored: () => Promise<any>;
  authDelete: () => Promise<boolean>;
  licenseCheck: () => boolean;
  licenseActivate: () => Promise<boolean>;
  licenseDeactivate: () => Promise<boolean>;
  licenseStatus: () => Promise<boolean>;
  onboardingStatus: () => Promise<boolean>;
  onboardingComplete: () => Promise<boolean>;
}

export const electronAPI: ElectronAPI = {
  // App & Window
  getPaths: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PATHS),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  // Storage
  storageGet: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET, key),
  storageSet: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SET, key, value),
  loadTasks: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD_TASKS),
  saveTasks: (tasks: TaskItem[]) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE_TASKS, tasks),
  loadNotes: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD_NOTES),
  saveNotes: (notes: NoteItem[]) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE_NOTES, notes),
  loadChats: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD_CHATS),
  saveChats: (chats: ChatMessage[]) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE_CHATS, chats),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD_SETTINGS),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE_SETTINGS, settings),

  // Memory
  readRawMemory: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_READ_RAW),
  writeRawMemory: (content: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_WRITE_RAW, content),
  writeMemoryEntry: (category: string, fact: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEMORY_WRITE_ENTRY, { category, fact }),
  deleteMemoryEntry: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_DELETE_ENTRY, id),
  optimizeMemory: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_OPTIMIZE),
  getAllMemory: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_ALL),

  // AI & Generation
  generateStream: (payload) => ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_STREAM, payload),
  cancelStream: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_STREAM),
  generateImage: (prompt: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_IMAGE, prompt),
  onStreamToken: (callback: (token: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, token: string) => callback(token);
    ipcRenderer.on('ai:stream-token', listener);
    return () => {
      ipcRenderer.removeListener('ai:stream-token', listener);
    };
  },
  onToolResult: (callback: (result: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: any) => callback(result);
    ipcRenderer.on('ai:tool-result', listener);
    return () => {
      ipcRenderer.removeListener('ai:tool-result', listener);
    };
  },

  // Tools
  executeTool: (toolName: string, params: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.TOOLS_EXECUTE, { toolName, params }),
  listTools: () => ipcRenderer.invoke(IPC_CHANNELS.TOOLS_LIST),

  // Agent Town
  assignAgentTask: (task) => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_ASSIGN_TASK, task),
  inspectAgentTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_INSPECT_TASK, taskId),
  stopAgentTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_STOP_TASK, taskId),
  listAgentTasks: () => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_LIST_TASKS),
  getAgentStates: () => ipcRenderer.invoke(IPC_CHANNELS.AGENTS_GET_STATES),

  // Native Info Panels
  openInfoPanel: (payload: InfoPanelPayload) => ipcRenderer.invoke(IPC_CHANNELS.INFO_PANEL_OPEN, payload),
  closeInfoPanel: (panelId: string) => ipcRenderer.invoke(IPC_CHANNELS.INFO_PANEL_CLOSE, panelId),
  getInfoPanelData: (panelId: string) => ipcRenderer.invoke(IPC_CHANNELS.INFO_PANEL_GET_DATA, panelId),

  // Media Player
  controlMedia: (action: string, data?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_CONTROL, { action, data }),
  playYouTube: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAY_YOUTUBE, url),

  // WhatsApp
  getWhatsAppStatus: () => ipcRenderer.invoke(IPC_CHANNELS.WHATSAPP_GET_STATUS),
  startWhatsAppAuth: () => ipcRenderer.invoke(IPC_CHANNELS.WHATSAPP_START_AUTH),
  logoutWhatsApp: () => ipcRenderer.invoke(IPC_CHANNELS.WHATSAPP_LOGOUT),
  sendWhatsAppMessage: (to: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.WHATSAPP_SEND_MESSAGE, { to, message }),

  // Hardware
  listSerialPorts: () => ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_LIST_PORTS),
  connectArduino: (port: string) => ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_CONNECT, { port }),
  disconnectArduino: () => ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_DISCONNECT),

  // Audio SFX
  playSfx: (soundName: string) => ipcRenderer.invoke(IPC_CHANNELS.AUDIO_PLAY_SFX, soundName),

  // Keyboard automation
  keyboardPress: (payload: { key: string }) => ipcRenderer.invoke('keyboard-press', payload),
  keyboardType: (payload: { text: string; pressEnter?: boolean }) => ipcRenderer.invoke('keyboard-type', payload),

  // Generic
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>,

  // Skills
  skillsList: () => ipcRenderer.invoke('skills-list'),
  skillsToggle: (folderName: string, enabled: boolean, isCore: boolean) => ipcRenderer.invoke('skills-toggle', folderName, enabled, isCore),
  skillsSave: (data: { name: string; description: string; content: string; folderName: string; isCore: boolean; category?: string }) => ipcRenderer.invoke('skills-save', data),
  skillsDelete: (folderName: string, isCore: boolean) => ipcRenderer.invoke('skills-delete', folderName, isCore),
  writeBootstrapFile: (filename: string, content: string) => ipcRenderer.invoke('write-bootstrap-file', filename, content),
  saveGeminiKey: (apiKey: string, voice: string) => ipcRenderer.invoke('save-gemini-key', apiKey, voice),
  saveLlmSettings: (provider: string, modelId: string, openRouterKey: string) => ipcRenderer.invoke('save-llm-settings', provider, modelId, openRouterKey),
  authCheckAccess: () => ipcRenderer.invoke('auth-check-access'),
  authStartCallbackServer: () => ipcRenderer.invoke('auth-start-callback-server'),
  authLogoutDevice: () => ipcRenderer.invoke('auth-logout-device'),

  // Legacy
  getWakeWordEnabled: () => ipcRenderer.invoke('get-wake-word-enabled'),
  setWakeWordEnabled: (enabled: boolean) => ipcRenderer.invoke('set-wake-word-enabled', enabled),
  getPreferDirectGemini: () => ipcRenderer.invoke('get-prefer-direct-gemini'),
  savePreferDirectGemini: (value: boolean) => ipcRenderer.invoke('save-prefer-direct-gemini', value),
  getVoiceAssistantMode: () => ipcRenderer.invoke('get-voice-assistant-mode'),
  saveVoiceAssistantMode: (value: string) => ipcRenderer.invoke('save-voice-assistant-mode', value),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (value: string) => ipcRenderer.invoke('set-theme', value),
  getSystemPaths: () => ipcRenderer.invoke('get-system-paths'),
  saveHistory: (data: any) => ipcRenderer.invoke('save-history', data),
  loadHistory: () => ipcRenderer.invoke('load-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  authSave: (data: any) => ipcRenderer.invoke('auth-save', data),
  authGetStored: () => ipcRenderer.invoke('auth-get-stored'),
  authDelete: () => ipcRenderer.invoke('auth-delete'),
  licenseCheck: () => ipcRenderer.sendSync('license-check'),
  licenseActivate: () => ipcRenderer.invoke('license-activate'),
  licenseDeactivate: () => ipcRenderer.invoke('license-deactivate'),
  licenseStatus: () => ipcRenderer.invoke('license-status'),
  onboardingStatus: () => ipcRenderer.invoke('onboarding-status'),
  onboardingComplete: () => ipcRenderer.invoke('onboarding-complete'),

  // WebFrame & Lifecycle
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
  notifyAppReady: () => ipcRenderer.invoke('splash-transition-complete'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  saveUserProfile: (profile: { name: string; age?: string | number }) =>
    ipcRenderer.invoke('save-user-profile', profile),
  getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  },
  getAuthStatus: () => ipcRenderer.invoke('auth-get-status'),
  signIn: () => ipcRenderer.invoke('auth-sign-in'),
  signOut: () => ipcRenderer.invoke('auth-sign-out'),
  onAuthStateChanged: (callback: (user: any) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, user: any) => callback(user);
    ipcRenderer.on('auth-state-changed', subscription);
    return () => { ipcRenderer.removeListener('auth-state-changed', subscription); };
  },
};
