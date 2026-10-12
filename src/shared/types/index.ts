// Shared Domain Models for AKKI AI

export type Priority = 'low' | 'medium' | 'high';
export type TaskCategory = 'work' | 'personal' | 'general';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  category: TaskCategory;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  category?: string;
  color?: string;
  favorite?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  avatarType?: 'user' | 'akki' | 'robot';
  content: string;
  thinking?: string;
  toolCalls?: ToolExecutionSummary[];
  timestamp: string;
  audioUrl?: string;
  attachments?: { name: string; size: number }[];
}

export interface ToolExecutionSummary {
  id: string;
  toolName: string;
  executionTimeSec: number;
  status: 'running' | 'success' | 'error';
  inputs?: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export type SubAgentName = 'Leo' | 'Rancho' | 'Raju' | 'Chatur';

export type SubAgentStatus = 'idle' | 'busy' | 'offline';

export interface SubAgentState {
  name: SubAgentName;
  role: string;
  specialty: string;
  avatar: string;
  status: SubAgentStatus;
  currentTaskId?: string;
  deskPosition: { x: number; y: number };
}

export type AgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentTask {
  id: string;
  assignedTo: SubAgentName;
  taskTitle: string;
  description: string;
  status: AgentTaskStatus;
  progressPercent: number;
  result?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface UserProfile {
  name: string;
  statusMessage: string;
  avatarUrl: string;
  location: string;
  interests: string[];
}

export interface AppSettings {
  primaryModel: string;
  primaryModelId?: string;
  primaryProvider?: string;
  geminiApiKey: string;
  openRouterApiKey: string;
  huggingFaceApiKey: string;
  picovoiceAccessKey: string;
  wakeWordEnabled: boolean;
  voiceProvider: 'browser' | 'gemini_live' | 'elevenlabs';
  selectedVoice?: string;
  voiceAssistantMode: 'voice' | 'expert';
  selectedPersona: string;
  customSystemPrompt: string;
  theme: 'akki' | 'violet-void' | 'solar-amber' | 'electric-cyan' | 'crimson-neon' | 'cyberpunk-dark' | 'cyberpunk-neon' | string;
  soundEffectsEnabled: boolean;
  bgmEnabled: boolean;
  userName?: string;
  location?: string;
  companionName?: string;
}

export interface MemoryEntry {
  id: string;
  category: string;
  fact: string;
  source: 'user' | 'observation' | 'system';
  timestamp: string;
}

export interface InfoPanelPayload {
  panelId: string;
  title: string;
  content: string;
  theme: 'cyan' | 'amber' | 'crimson' | 'emerald' | 'blue';
}
