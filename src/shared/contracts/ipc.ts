// Typed IPC Channel Contracts for AKKI AI

export const IPC_CHANNELS = {
  // App & System
  APP_GET_PATHS: 'app:get-paths',
  APP_GET_VERSION: 'app:get-version',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Storage CRUD
  STORAGE_GET: 'storage:get',
  STORAGE_SET: 'storage:set',
  STORAGE_LOAD_TASKS: 'storage:load-tasks',
  STORAGE_SAVE_TASKS: 'storage:save-tasks',
  STORAGE_LOAD_NOTES: 'storage:load-notes',
  STORAGE_SAVE_NOTES: 'storage:save-notes',
  STORAGE_LOAD_CHATS: 'storage:load-chats',
  STORAGE_SAVE_CHATS: 'storage:save-chats',
  STORAGE_LOAD_SETTINGS: 'storage:load-settings',
  STORAGE_SAVE_SETTINGS: 'storage:save-settings',

  // Memory Service
  MEMORY_READ_RAW: 'memory:read-raw',
  MEMORY_WRITE_RAW: 'memory:write-raw',
  MEMORY_WRITE_ENTRY: 'memory:write-entry',
  MEMORY_DELETE_ENTRY: 'memory:delete-entry',
  MEMORY_OPTIMIZE: 'memory:optimize',
  MEMORY_GET_ALL: 'memory:get-all',

  // AI & Generation
  AI_GENERATE_STREAM: 'ai:generate-stream',
  AI_CANCEL_STREAM: 'ai:cancel-stream',
  AI_GENERATE_IMAGE: 'ai:generate-image',

  // Tools Execution
  TOOLS_EXECUTE: 'tools:execute',
  TOOLS_LIST: 'tools:list',

  // Agent Town Delegation
  AGENTS_ASSIGN_TASK: 'agents:assign-task',
  AGENTS_INSPECT_TASK: 'agents:inspect-task',
  AGENTS_STOP_TASK: 'agents:stop-task',
  AGENTS_LIST_TASKS: 'agents:list-tasks',
  AGENTS_GET_STATES: 'agents:get-states',

  // Native Info Panels
  INFO_PANEL_OPEN: 'info-panel:open',
  INFO_PANEL_CLOSE: 'info-panel:close',
  INFO_PANEL_GET_DATA: 'info-panel:get-data',

  // Media Player
  MEDIA_CONTROL: 'media:control',
  MEDIA_PLAY_YOUTUBE: 'media:play-youtube',

  // WhatsApp
  WHATSAPP_GET_STATUS: 'whatsapp:get-status',
  WHATSAPP_START_AUTH: 'whatsapp:start-auth',
  WHATSAPP_LOGOUT: 'whatsapp:logout',
  WHATSAPP_SEND_MESSAGE: 'whatsapp:send-message',

  // Hardware & Arduino
  HARDWARE_LIST_PORTS: 'hardware:list-ports',
  HARDWARE_CONNECT: 'hardware:connect',
  HARDWARE_DISCONNECT: 'hardware:disconnect',

  // Audio & Sound Effects
  AUDIO_PLAY_SFX: 'audio:play-sfx',
} as const;

export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
