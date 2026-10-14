import { create } from 'zustand';
import { DEFAULT_MODELS } from '../../shared/config/models';
import {
  TaskItem,
  NoteItem,
  ChatMessage,
  SubAgentState,
  AgentTask,
  AppSettings,
  Priority,
  TaskCategory
} from '@shared/types';

interface AppState {
  // Panel States
  leftPanelTab: 'tasks' | 'notes';
  setLeftPanelTab: (tab: 'tasks' | 'notes') => void;

  rightPanelTab: 'chats' | 'logs';
  setRightPanelTab: (tab: 'chats' | 'logs') => void;

  rightWidth: number;
  setRightWidth: (w: number) => void;
  isResizingRight: boolean;
  setIsResizingRight: (r: boolean) => void;

  centerView: 'agent-town' | 'visual-hub';
  setCenterView: (view: 'agent-town' | 'visual-hub') => void;

  activeModal: 'soul' | 'memory' | 'skills' | 'settings' | 'profile' | null;
  setActiveModal: (modal: 'soul' | 'memory' | 'skills' | 'settings' | 'profile' | null) => void;

  isGuideModalOpen: boolean;
  setIsGuideModalOpen: (open: boolean) => void;
  guideFromSettings: boolean;
  setGuideFromSettings: (val: boolean) => void;

  // AI & Companion
  assistantStatus: 'standby' | 'listening' | 'thinking' | 'speaking';
  setAssistantStatus: (status: 'standby' | 'listening' | 'thinking' | 'speaking') => void;
  companionSpeech: string;
  setCompanionSpeech: (speech: string) => void;

  // Chat
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;

  // Tasks
  tasks: TaskItem[];
  setTasks: (tasks: TaskItem[]) => void;
  addTask: (title: string, priority: Priority, category: TaskCategory) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  taskFilter: 'all' | 'pending' | 'completed' | 'high';
  setTaskFilter: (filter: 'all' | 'pending' | 'completed' | 'high') => void;
  categoryFilter: 'all' | 'work' | 'personal';
  setCategoryFilter: (filter: 'all' | 'work' | 'personal') => void;

  // Notes
  notes: NoteItem[];
  setNotes: (notes: NoteItem[]) => void;
  currentNote: NoteItem | null;
  setCurrentNote: (note: NoteItem | null) => void;
  saveCurrentNote: (title: string, content: string) => void;
  deleteNote: (id: string) => void;

  // Agent Town
  subAgents: SubAgentState[];
  setSubAgents: (agents: SubAgentState[]) => void;
  selectedAgent: string;
  setSelectedAgent: (name: string) => void;
  agentTasks: AgentTask[];
  addAgentTask: (task: AgentTask) => void;

  // Media & Video Popup
  activeVideoId: string | null;
  setActiveVideoId: (id: string | null) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  currentTrack: { title: string; artist: string; duration: string };

  // Visual Hub Artifacts
  visualHubState: {
    activeTab: 'diagram' | 'image';
    mermaidCode: string | null;
    diagramTitle: string | null;
    imageUrl: string | null;
    imagePrompt: string | null;
    videoId: string | null;
    videoTitle: string | null;
  };
  setVisualHubState: (state: Partial<AppState['visualHubState']>) => void;

  // Settings & Theme
  theme: string;
  setTheme: (theme: string) => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;

  // Auth
  isAuthenticated: boolean;
  setIsAuthenticated: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeVideoId: null,
  setActiveVideoId: (activeVideoId) => set({ activeVideoId }),

  leftPanelTab: 'tasks',
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),

  rightPanelTab: 'chats',
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  rightWidth: 510,
  setRightWidth: (rightWidth) => set({ rightWidth }),
  isResizingRight: false,
  setIsResizingRight: (isResizingRight) => set({ isResizingRight }),

  centerView: 'agent-town',
  setCenterView: (view) => set({ centerView: view }),

  activeModal: null,
  setActiveModal: (modal) => set({ activeModal: modal }),

  isGuideModalOpen: false,
  setIsGuideModalOpen: (isGuideModalOpen) => set({ isGuideModalOpen }),
  guideFromSettings: false,
  setGuideFromSettings: (guideFromSettings) => set({ guideFromSettings }),

  assistantStatus: 'standby',
  setAssistantStatus: (status) => set({ assistantStatus: status }),

  companionSpeech: '',
  setCompanionSpeech: (speech) => set({ companionSpeech: speech }),

  messages: [],
  setMessages: (messages) => {
    set((state) => {
      const resolved = typeof messages === 'function' ? (messages as (prev: ChatMessage[]) => ChatMessage[])(state.messages) : messages;
      if ((window as any).electronAPI?.saveChats) {
        (window as any).electronAPI.saveChats(resolved);
      }
      return { messages: resolved };
    });
  },
  addMessage: (message) => {
    set((state) => {
      const updated = [...state.messages, message];
      if ((window as any).electronAPI?.saveChats) {
        (window as any).electronAPI.saveChats(updated);
      }
      return { messages: updated };
    });
  },
  clearMessages: () => {
    set({ messages: [] });
    if ((window as any).electronAPI?.saveChats) {
      (window as any).electronAPI.saveChats([]);
    }
  },
  isStreaming: false,
  setIsStreaming: (isStreaming) => set({ isStreaming }),

  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (title, priority, category) => {
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      title,
      priority,
      category,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ tasks: [newTask, ...state.tasks] }));
    if ((window as any).electronAPI?.saveTasks) {
      (window as any).electronAPI.saveTasks(get().tasks);
    }
  },
  toggleTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t
      ),
    }));
    if ((window as any).electronAPI?.saveTasks) {
      (window as any).electronAPI.saveTasks(get().tasks);
    }
  },
  deleteTask: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    if ((window as any).electronAPI?.saveTasks) {
      (window as any).electronAPI.saveTasks(get().tasks);
    }
  },
  taskFilter: 'all',
  setTaskFilter: (taskFilter) => set({ taskFilter }),
  categoryFilter: 'all',
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),

  notes: [],
  setNotes: (notes) => set({ notes }),
  currentNote: null,
  setCurrentNote: (note) => set({ currentNote: note }),
  saveCurrentNote: (title, content) => {
    const current = get().currentNote;
    if (current) {
      const updated = { ...current, title, content, updatedAt: new Date().toISOString() };
      const newNotes = get().notes.map((n) => (n.id === updated.id ? updated : n));
      set({ notes: newNotes, currentNote: updated });
      if ((window as any).electronAPI?.saveNotes) {
        (window as any).electronAPI.saveNotes(newNotes);
      }
    } else {
      const newNote: NoteItem = {
        id: `note-${Date.now()}`,
        title,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const newNotes = [newNote, ...get().notes];
      set({ notes: newNotes, currentNote: newNote });
      if ((window as any).electronAPI?.saveNotes) {
        (window as any).electronAPI.saveNotes(newNotes);
      }
    }
  },
  deleteNote: (id) => {
    const newNotes = get().notes.filter((n) => n.id !== id);
    const newCurrent = get().currentNote?.id === id ? null : get().currentNote;
    set({ notes: newNotes, currentNote: newCurrent });
    if ((window as any).electronAPI?.saveNotes) {
      (window as any).electronAPI.saveNotes(newNotes);
    }
  },

  subAgents: [
    {
      name: 'Leo',
      role: 'Code & Heavy Analysis',
      specialty: 'Algorithmic breakdown and syntax verification',
      avatar: 'Premade_Character_48x48_01.png',
      status: 'idle',
      deskPosition: { x: 3, y: 7 },
    },
    {
      name: 'Rancho',
      role: 'Web & Deep Research',
      specialty: 'Scraping, market trend intelligence, multi-source synthesis',
      avatar: 'Premade_Character_48x48_02.png',
      status: 'idle',
      deskPosition: { x: 5, y: 4 },
    },
    {
      name: 'Raju',
      role: 'Hardware & Automation',
      specialty: 'Arduino serial protocols, device automation, repetitive pipelines',
      avatar: 'Premade_Character_48x48_03.png',
      status: 'idle',
      deskPosition: { x: 10, y: 9 },
    },
    {
      name: 'Chatur',
      role: 'Formatting & Math',
      specialty: 'LaTeX, JSON schema enforcement, algebraic formulas',
      avatar: 'Premade_Character_48x48_04.png',
      status: 'idle',
      deskPosition: { x: 9, y: 4 },
    },
  ],
  setSubAgents: (subAgents) => set({ subAgents }),
  selectedAgent: 'Leo',
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
  agentTasks: [],
  addAgentTask: (task) => set((state) => ({ agentTasks: [task, ...state.agentTasks] })),

  isPlaying: false,
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  currentTrack: {
    title: 'Phir Bhi Tumko Chaahunga',
    artist: 'Arijit Singh',
    duration: '04:12',
  },

  visualHubState: {
    activeTab: 'diagram',
    mermaidCode: null,
    diagramTitle: null,
    imageUrl: null,
    imagePrompt: null,
    videoId: null,
    videoTitle: null,
  },
  setVisualHubState: (newState) =>
    set((state) => ({
      visualHubState: { ...state.visualHubState, ...newState },
    })),

  theme: 'akki',
  setTheme: (theme: string) => {
    set((state) => ({
      theme,
      settings: { ...state.settings, theme },
    }));
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('akki_theme', theme);
    } catch (_) {}
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('set-theme', theme).catch(() => {});
    }
    if ((window as any).electronAPI?.setTheme) {
      (window as any).electronAPI.setTheme(theme).catch(() => {});
    }
  },

  settings: {
    primaryModel: DEFAULT_MODELS.primary,
    geminiApiKey: '',
    openRouterApiKey: '',
    huggingFaceApiKey: '',
    picovoiceAccessKey: '',
    wakeWordEnabled: false,
    voiceProvider: 'browser',
    voiceAssistantMode: 'voice',
    selectedPersona: 'caring_companion',
    customSystemPrompt: '',
    theme: 'akki',
    soundEffectsEnabled: true,
    bgmEnabled: false,
  },
  updateSettings: (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    if (newSettings.theme) {
      set({ theme: newSettings.theme });
      document.documentElement.setAttribute('data-theme', newSettings.theme);
    }
    if ((window as any).electronAPI?.saveSettings) {
      (window as any).electronAPI.saveSettings(updated);
    }
  },

  isAuthenticated: false,
  setIsAuthenticated: (val) => set({ isAuthenticated: val }),
}));

