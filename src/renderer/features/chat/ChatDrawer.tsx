import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Plus,
  ArrowUp,
  Square,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  AlertTriangle,
  AlertCircle,
  Info,
  Cpu,
  Terminal,
  Loader2,
  ChevronDown,
  ChevronRight,
  File,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import { ChatMessage, ToolExecutionSummary, ToolTrace } from '@shared/types';
import { ToolTraceCard } from './components/ToolTraceCard';

interface AttachedFile {
  name: string;
  size: number;
  data?: string;
  mimeType?: string;
  content?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'tool' | 'error' | 'agent' | 'warning' | 'success';
  message: string;
  details?: any;
  toolName?: string;
  duration?: string;
  durationMs?: number;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  chatMode?: 'voice' | 'expert';
  agentId?: string;
  agentName?: string;
  sessionId?: string;
}

class HermesWsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();
  private eventListeners = new Map<string, Set<(data: any) => void>>();
  private statusListeners = new Set<(status: string) => void>();
  private _status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'unreachable' = 'disconnected';
  private url: string;
  private token: string;
  private connectReject: ((err: any) => void) | null = null;
  private connectSettled = false;
  private autoReconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: any = null;
  private intentionalClose = false;

  constructor(url: string = 'ws://127.0.0.1:18789/', token: string = '') {
    this.url = url;
    this.token = token;
  }

  get status() {
    return this._status;
  }

  setStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'unreachable') {
    this._status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  onStatus(fn: (status: string) => void) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  on(event: string, fn: (data: any) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(fn);
    return () => {
      this.eventListeners.get(event)?.delete(fn);
    };
  }

  connect() {
    this.autoReconnect = true;
    this.reconnectAttempt = 0;
    this.intentionalClose = false;
    return this.connectOnce();
  }

  connectOnce(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {}
        this.ws = null;
      }
      this.setStatus('connecting');
      this.connectSettled = false;
      this.connectReject = reject;
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => {
          this.sendConnectHandshake();
        };

        ws.onmessage = (evt) => {
          let frame: any;
          try {
            frame = JSON.parse(typeof evt.data === 'string' ? evt.data : '{}');
          } catch {
            return;
          }
          this.handleFrame(frame, (res) => {
            if (!this.connectSettled) {
              this.connectSettled = true;
              this.connectReject = null;
              this.reconnectAttempt = 0;
              resolve(res);
            }
          });
        };

        ws.onerror = () => {
          if (this._status !== 'unreachable') {
            this.setStatus('error');
          }
          this.rejectConnect(new Error('WebSocket connection error'));
        };

        ws.onclose = () => {
          const wasConnected = this._status === 'connected';
          if (this._status !== 'unreachable') {
            this.setStatus('disconnected');
          }
          this.rejectConnect(new Error('Connection closed before handshake'));
          this.clearPending();
          if (!this.intentionalClose && this.autoReconnect) {
            this.scheduleReconnect(wasConnected);
          }
        };
      } catch (e) {
        this.setStatus('error');
        this.rejectConnect(e);
      }
    });
  }

  private scheduleReconnect(resetAttempt: boolean) {
    if (this.reconnectTimer) return;
    if (resetAttempt) this.reconnectAttempt = 0;
    if (this.reconnectAttempt >= 5) {
      this.autoReconnect = false;
      this.setStatus('unreachable');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.autoReconnect && !this.intentionalClose) {
        this.connectOnce().catch(() => {});
      }
    }, delay);
  }

  private rejectConnect(err: any) {
    if (!this.connectSettled) {
      this.connectSettled = true;
      this.connectReject?.(err);
      this.connectReject = null;
    }
  }

  private clearPending() {
    for (const [id, req] of this.pending) {
      req.reject(new Error('Connection closed'));
      clearTimeout(req.timer);
      this.pending.delete(id);
    }
  }

  private handleFrame(frame: any, onConnected?: (res: any) => void) {
    if (frame.type === 'event') {
      if (frame.event === 'connect.challenge') {
        this.sendConnectHandshake();
        return;
      }
      if (frame.event) {
        const listeners = this.eventListeners.get(frame.event);
        listeners?.forEach((fn) => fn(frame.data));
      }
      const wildcard = this.eventListeners.get('*');
      wildcard?.forEach((fn) => fn(frame));
      return;
    }

    if (frame.type === 'res' && frame.id) {
      const pending = this.pending.get(frame.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(frame.id);
        if (frame.ok) {
          if (frame.payload?.type === 'hello-ok') {
            this.setStatus('connected');
            onConnected?.(frame);
          }
          pending.resolve(frame);
        } else {
          pending.reject(new Error(frame.error?.message ?? 'Request failed'));
        }
        return;
      }
    }

    if (frame.ok && frame.payload?.type === 'hello-ok') {
      this.setStatus('connected');
      onConnected?.(frame);
      return;
    }
  }

  private sendConnectHandshake() {
    const reqId = 'aw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const msg = {
      type: 'req',
      id: reqId,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',
          displayName: 'Agent Town',
          version: '1.0.0',
          platform: 'web',
          mode: 'backend',
          instanceId: 'aw-' + Date.now(),
        },
        auth: { token: this.token },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        locale: 'en-US',
      },
    };
    const timer = setTimeout(() => {
      this.pending.delete(reqId);
      this.setStatus('unreachable');
      this.rejectConnect(new Error('Handshake timeout (15s)'));
    }, 15000);

    this.pending.set(reqId, {
      resolve: () => {},
      reject: (err) => {
        this.autoReconnect = false;
        this.setStatus('unreachable');
        this.rejectConnect(err);
      },
      timer,
    });
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch {}
  }

  async request(method: string, params: any, timeout = 30000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Hermes Bridge');
    }
    const reqId = 'aw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Timeout: ' + method));
      }, timeout);
      this.pending.set(reqId, { resolve, reject, timer });
      const req = { type: 'req', id: reqId, method, params };
      this.ws?.send(JSON.stringify(req));
    });
  }

  disconnect() {
    this.intentionalClose = true;
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectSettled = true;
    this.connectReject = null;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.clearPending();
    this.setStatus('disconnected');
  }
}

export const ChatDrawer: React.FC = () => {
  const {
    rightPanelTab,
    setRightPanelTab,
    messages,
    setMessages,
    addMessage,
    clearMessages,
    isStreaming,
    setIsStreaming,
    selectedAgent,
    subAgents,
    agentTasks,
  } = useAppStore();

  const { playClick, playAction } = useAudio();

  const [viewMode, setViewMode] = useState<'messages' | 'history'>('messages');
  const [activeMode, setActiveMode] = useState<'voice' | 'expert'>(() => {
    const saved = localStorage.getItem('akki_chat_mode');
    return saved === 'expert' || saved === 'hermes' ? 'expert' : 'voice';
  });

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('akki_chat_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s) => ({
            ...s,
            chatMode: s.chatMode || 'voice',
          }));
        }
      }
    } catch {}
    return [
      {
        id: 'session-default',
        title: 'New Session',
        timestamp: Date.now(),
        messages: [],
        chatMode: 'voice',
      },
    ];
  });

  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const isExpert =
      localStorage.getItem('akki_chat_mode') === 'expert' ||
      localStorage.getItem('akki_chat_mode') === 'hermes';
    const key = isExpert ? 'akki_active_hermes_chat_id' : 'akki_active_voice_chat_id';
    return localStorage.getItem(key) || localStorage.getItem('akki_active_chat_id') || 'session-default';
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [thinkingEnabled] = useState(true);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // Hermes WebSocket Bridge & Task tracking
  const wsClientRef = useRef<HermesWsClient | null>(null);
  const [wsStatus, setWsStatus] = useState<string>('disconnected');
  const currentRunIdRef = useRef<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log-1',
      timestamp: '11:40:02',
      level: 'info',
      message: 'System desktop runtime initialized.',
    },
    {
      id: 'log-2',
      timestamp: '11:40:15',
      level: 'agent',
      message: 'Agent Town core (Leo, Rancho, Raju, Chatur) loaded.',
    },
    {
      id: 'log-3',
      timestamp: '11:40:22',
      level: 'tool',
      toolName: 'query_memory',
      duration: '0.8s',
      durationMs: 800,
      message: 'Module: query_memory',
      details: {
        params: { query: 'user_profile', limit: 5 },
        output: { status: 'success', matchCount: 3, memoryIds: ['mem_01', 'mem_02'] },
      },
    },
    {
      id: 'log-4',
      timestamp: '11:40:24',
      level: 'tool',
      toolName: 'store_memory',
      duration: '0.1s',
      durationMs: 100,
      message: 'Module: store_memory',
      details: {
        params: { fact: 'Session active', importance: 5 },
        output: { status: 'stored', memoryId: 'mem_vect_88219', persisted: true },
      },
    },
    {
      id: 'log-5',
      timestamp: '11:40:25',
      level: 'tool',
      toolName: 'manage_tasks',
      duration: '0.8s',
      durationMs: 800,
      message: 'Module: manage_tasks',
      details: {
        params: { action: 'list' },
        output: { tasks: ['Research models', 'Sync workspace'], count: 2 },
      },
    },
  ]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'tool' | 'error'>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const logsScrollRef = useRef<HTMLDivElement | null>(null);
  const toolStartTimesRef = useRef<Map<string, number>>(new Map());

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Initial load of messages for active session
  useEffect(() => {
    if (!activeChatId) return;
    const current = sessions.find((s) => s.id === activeChatId);
    if (current && Array.isArray(current.messages) && current.messages.length > 0) {
      setMessages(current.messages);
    }
  }, []);

  // Sync sessions with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('akki_chat_sessions', JSON.stringify(sessions));
      localStorage.setItem('akki_active_chat_id', activeChatId);
      if (activeMode === 'expert') {
        localStorage.setItem('akki_active_hermes_chat_id', activeChatId);
      } else {
        localStorage.setItem('akki_active_voice_chat_id', activeChatId);
      }
    } catch {}
  }, [sessions, activeChatId, activeMode]);

  // Keep active session messages in sync when store messages change
  useEffect(() => {
    if (!activeChatId) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeChatId) {
          const firstUserMsg = messages.find((m) => m.sender === 'user');
          const autoTitle =
            s.title === 'New Session' && firstUserMsg?.content
              ? firstUserMsg.content.slice(0, 30)
              : s.title;
          return {
            ...s,
            title: autoTitle,
            messages,
          };
        }
        return s;
      })
    );
  }, [messages, activeChatId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Listen for tool results from Electron IPC
  useEffect(() => {
    if ((window as any).electronAPI?.onToolResult) {
      const cleanup = (window as any).electronAPI.onToolResult((result: any) => {
        const toolName = result.toolName || result.name || 'tool';
        const durationSec =
          result.executionTimeSec != null
            ? `${Number(result.executionTimeSec).toFixed(1)}s`
            : '0.8s';
        const durationMs =
          result.executionTimeSec != null
            ? Math.round(Number(result.executionTimeSec) * 1000)
            : 800;

        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            level: result.status === 'error' || result.error ? 'error' : 'tool',
            toolName,
            duration: durationSec,
            durationMs,
            message: `Module: ${toolName}`,
            details:
              result.params || result.output
                ? {
                    params: result.params || result.args,
                    output: result.output,
                  }
                : result.details || result.output,
          },
        ]);

        if (result.toolName === 'play_youtube_video') {
          const vId = result.output?.videoId || result.output?.id;
          if (vId) {
            useAppStore.getState().setActiveVideoId(vId);
            if ((window as any).electronAPI?.invoke) {
              (window as any).electronAPI.invoke('play-youtube-video', vId).catch(() => {});
            }
          }
        } else if (result.toolName === 'generate_image') {
          useAppStore.getState().setVisualHubState({
            imageUrl: result.output?.imageUrl,
            imagePrompt: result.output?.prompt,
            activeTab: 'image',
          });
          useAppStore.getState().setCenterView('visual-hub');
        } else if (result.toolName === 'generate_diagram') {
          const code = result.output?.mermaidCode || result.output?.code;
          useAppStore.getState().setVisualHubState({
            mermaidCode: code,
            diagramTitle: result.output?.title,
            activeTab: 'diagram',
          });
          useAppStore.getState().setCenterView('visual-hub');
        }
      });
      return cleanup;
    }
  }, []);

  // Connect Hermes WebSocket Client (Port 18789)
  useEffect(() => {
    const client = new HermesWsClient('ws://127.0.0.1:18789/', '');
    wsClientRef.current = client;

    const unsubStatus = client.onStatus((status) => {
      setWsStatus(status);
    });

    const unsubAgent = client.on('agent', (sI: any) => {
      if (!sI) return;
      if (currentRunIdRef.current && sI.runId && sI.runId !== currentRunIdRef.current) return;

      if (sI.stream === 'assistant') {
        const delta = sI.data?.delta;
        if (!delta) return;
        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          const target = prev[actualIdx];
          const updated = [...prev];
          updated[actualIdx] = {
            ...target,
            content: (target.content || '') + delta,
            thinking: target.thinking === 'Thinking...' ? undefined : target.thinking,
          };
          return updated;
        });
      } else if (sI.stream === 'reasoning') {
        const reasoning = sI.data?.text || '';
        if (!reasoning) return;
        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          const target = prev[actualIdx];
          const updated = [...prev];
          updated[actualIdx] = {
            ...target,
            thinking:
              target.thinking && target.thinking !== 'Thinking...'
                ? target.thinking + '\n' + reasoning
                : reasoning,
          };
          return updated;
        });
      } else if (sI.stream === 'tool_start') {
        const toolName = sI.data?.name || 'tool';
        const toolId = sI.data?.id ? `tool-${sI.data.id}` : `tool-${Date.now()}`;
        const newTool: ToolExecutionSummary = {
          id: toolId,
          toolName,
          executionTimeSec: 0,
          status: 'running',
          inputs: sI.data?.args,
        };
        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          const target = prev[actualIdx];
          const updated = [...prev];
          updated[actualIdx] = {
            ...target,
            toolCalls: [...(target.toolCalls || []), newTool],
          };
          return updated;
        });
        const toolKey = toolId || toolName;
        toolStartTimesRef.current.set(toolKey, Date.now());
        toolStartTimesRef.current.set(toolName, Date.now());
      } else if (sI.stream === 'tool_end') {
        const toolName = sI.data?.name || 'tool';
        const toolId = sI.data?.id ? `tool-${sI.data.id}` : null;
        const isOk = sI.data?.ok !== false;
        const output = sI.data?.output;

        const startTime =
          (toolId && toolStartTimesRef.current.get(toolId)) ||
          toolStartTimesRef.current.get(toolName);
        const durationMs = startTime ? Date.now() - startTime : 800;
        const durationSec = Number((durationMs / 1000).toFixed(1));
        if (toolId) toolStartTimesRef.current.delete(toolId);
        toolStartTimesRef.current.delete(toolName);

        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          const target = prev[actualIdx];
          const tools = [...(target.toolCalls || [])];
          let toolIdx = toolId ? tools.findIndex((t) => t.id === toolId) : -1;
          if (toolIdx === -1) {
            toolIdx = tools.map((t) => t.status).lastIndexOf('running');
          }
          if (toolIdx !== -1) {
            tools[toolIdx] = {
              ...tools[toolIdx],
              executionTimeSec: durationSec,
              status: isOk ? 'success' : 'error',
              output,
            };
          } else {
            tools.push({
              id: toolId || `tool-${Date.now()}`,
              toolName,
              executionTimeSec: durationSec,
              status: isOk ? 'success' : 'error',
              output,
            });
          }
          const updated = [...prev];
          updated[actualIdx] = {
            ...target,
            toolCalls: tools,
          };
          return updated;
        });
        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            level: isOk ? 'tool' : 'error',
            toolName,
            duration: `${durationSec.toFixed(1)}s`,
            durationMs,
            message: `Module: ${toolName}`,
            details: {
              params: sI.data?.args,
              output,
            },
          },
        ]);
      } else if (sI.stream === 'status') {
        const statusText = sI.data?.text || '';
        if (statusText) {
          setLogs((prev) => [
            ...prev,
            {
              id: `log-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              level: 'agent',
              message: statusText,
            },
          ]);
        }
      } else if (sI.stream === 'lifecycle') {
        if (sI.data?.phase === 'error') {
          const errText = sI.data?.error || 'Unknown error';
          setIsStreaming(false);
          setMessages((prev) => {
            const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
            if (lastIdx === -1) return prev;
            const actualIdx = prev.length - 1 - lastIdx;
            const target = prev[actualIdx];
            const updated = [...prev];
            updated[actualIdx] = {
              ...target,
              content: (target.content || '') + `\n\nError: ${errText}`,
            };
            return updated;
          });
        } else if (sI.data?.phase === 'end') {
          setIsStreaming(false);
        }
      }
    });

    const unsubChat = client.on('chat', (sI: any) => {
      if (!sI) return;
      if (currentRunIdRef.current && sI.runId && sI.runId !== currentRunIdRef.current) return;

      if (sI.state === 'final') {
        setIsStreaming(false);
        const finalText = sI.message?.content?.[0]?.text;
        if (finalText) {
          setMessages((prev) => {
            const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
            if (lastIdx === -1) return prev;
            const actualIdx = prev.length - 1 - lastIdx;
            const target = prev[actualIdx];
            if (!target.content) {
              const updated = [...prev];
              updated[actualIdx] = {
                ...target,
                content: finalText,
              };
              return updated;
            }
            return prev;
          });
        }
      } else if (sI.state === 'error' || sI.state === 'aborted') {
        setIsStreaming(false);
      }
    });

    client.connect().catch((err) => {
      console.warn('[Hermes Chat Client] Connection attempt failed:', err);
    });

    return () => {
      unsubStatus();
      unsubAgent();
      unsubChat();
      client.disconnect();
    };
  }, [setMessages, setIsStreaming]);

  // Switch Mode handler
  const switchMode = useCallback(
    (targetMode: 'voice' | 'expert') => {
      if (targetMode === activeMode) return;
      playClick();

      // 1. Save current active chat ID for current mode
      if (activeMode === 'voice') {
        localStorage.setItem('akki_active_voice_chat_id', activeChatId);
      } else {
        localStorage.setItem('akki_active_hermes_chat_id', activeChatId);
      }

      setActiveMode(targetMode);
      localStorage.setItem('akki_chat_mode', targetMode === 'expert' ? 'hermes' : 'voice');

      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          level: 'info',
          message: `Chat Mode switched to ${targetMode === 'expert' ? 'Expert Agent' : 'Voice Assistant'}`,
        },
      ]);

      // 2. Find target chat ID for target mode
      const targetKey =
        targetMode === 'expert' ? 'akki_active_hermes_chat_id' : 'akki_active_voice_chat_id';
      let targetId = localStorage.getItem(targetKey);

      let found = sessions.find((s) => s.id === targetId && (s.chatMode || 'voice') === targetMode);
      if (!found) {
        const candidate = sessions
          .filter((s) => (s.chatMode || 'voice') === targetMode)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (candidate) {
          found = candidate;
          targetId = candidate.id;
        } else {
          const newSession: ChatSession = {
            id: `session-${Date.now()}`,
            title: 'New Session',
            timestamp: Date.now(),
            messages: [],
            chatMode: targetMode,
          };
          setSessions((prev) => [newSession, ...prev]);
          found = newSession;
          targetId = newSession.id;
        }
      }

      if (targetId && found) {
        setActiveChatId(targetId);
        localStorage.setItem('akki_active_chat_id', targetId);
        localStorage.setItem(targetKey, targetId);
        setMessages(found.messages || []);
        setViewMode('messages');
      }
    },
    [activeMode, activeChatId, sessions, setMessages, playClick]
  );

  // New Chat Session handler
  const handleNewChat = useCallback(() => {
    const activeAgent = subAgents.find((a) => a.name === selectedAgent);
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session',
      timestamp: Date.now(),
      messages: [],
      chatMode: activeMode,
      agentId: activeAgent?.name,
      agentName: activeAgent?.name,
      sessionId: activeAgent ? `agent:${activeAgent.name}:t-${Date.now()}` : undefined,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveChatId(newId);
    localStorage.setItem('akki_active_chat_id', newId);
    if (activeMode === 'voice') {
      localStorage.setItem('akki_active_voice_chat_id', newId);
    } else {
      localStorage.setItem('akki_active_hermes_chat_id', newId);
    }
    clearMessages();
    setInputPrompt('');
    setViewMode('messages');
  }, [activeMode, selectedAgent, subAgents, clearMessages]);

  // Switch Chat Session handler
  const handleSwitchChat = useCallback(
    (chatId: string) => {
      const target = sessions.find((s) => s.id === chatId);
      if (target) {
        setActiveChatId(chatId);
        localStorage.setItem('akki_active_chat_id', chatId);
        const mode = target.chatMode || 'voice';
        setActiveMode(mode);
        localStorage.setItem('akki_chat_mode', mode === 'expert' ? 'hermes' : 'voice');
        if (mode === 'voice') {
          localStorage.setItem('akki_active_voice_chat_id', chatId);
        } else {
          localStorage.setItem('akki_active_hermes_chat_id', chatId);
        }
        setMessages(target.messages || []);
        setViewMode('messages');
      }
    },
    [sessions, setMessages]
  );

  // Delete Chat Session handler
  const handleDeleteChat = useCallback(
    (chatId: string) => {
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== chatId);
        if (filtered.length === 0) {
          const fallback: ChatSession = {
            id: `session-${Date.now()}`,
            title: 'New Session',
            timestamp: Date.now(),
            messages: [],
            chatMode: activeMode,
          };
          setActiveChatId(fallback.id);
          localStorage.setItem('akki_active_chat_id', fallback.id);
          if (activeMode === 'voice') {
            localStorage.setItem('akki_active_voice_chat_id', fallback.id);
          } else {
            localStorage.setItem('akki_active_hermes_chat_id', fallback.id);
          }
          clearMessages();
          return [fallback];
        }
        if (chatId === activeChatId) {
          const nextForMode =
            filtered.find((s) => (s.chatMode || 'voice') === activeMode) || filtered[0];
          setActiveChatId(nextForMode.id);
          localStorage.setItem('akki_active_chat_id', nextForMode.id);
          const mode = nextForMode.chatMode || 'voice';
          setActiveMode(mode);
          if (mode === 'voice') {
            localStorage.setItem('akki_active_voice_chat_id', nextForMode.id);
          } else {
            localStorage.setItem('akki_active_hermes_chat_id', nextForMode.id);
          }
          setMessages(nextForMode.messages || []);
        }
        return filtered;
      });
    },
    [activeChatId, activeMode, clearMessages, setMessages]
  );

  // Attachment handling
  const handleRemoveAttachment = (index: number) => {
    playClick();
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          if (attachedFiles.length >= 5) return;
          const reader = new FileReader();
          reader.onload = (event) => {
            const res = event.target?.result as string;
            if (res) {
              const newAttach: AttachedFile = {
                name: `pasted_image_${Date.now()}.png`,
                size: file.size,
                data: res,
                mimeType: file.type,
              };
              setAttachedFiles((prev) => [...prev.slice(-4), newAttach]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleThinkingCollapse = (msgId: string) => {
    playClick();
    setExpandedThinking((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleToolCollapse = (toolId: string) => {
    playClick();
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isStreaming) {
      // Halt streaming
      setIsStreaming(false);
      if (activeMode === 'expert') {
        if (currentRunIdRef.current) {
          wsClientRef.current
            ?.request('chat.abort', { runId: currentRunIdRef.current, sessionKey: 'default' })
            .catch(() => {});
          if ((window as any).electronAPI?.stopAgentTask) {
            (window as any).electronAPI.stopAgentTask(currentRunIdRef.current).catch(() => {});
          }
        }
        setMessages((prev) => {
          const lastIdx = [...prev].reverse().findIndex((m) => m.sender === 'assistant');
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          const target = prev[actualIdx];
          const updated = [...prev];
          updated[actualIdx] = {
            ...target,
            thinking: target.thinking ? target.thinking + '\n[Stopped by user]' : '[Stopped by user]',
          };
          return updated;
        });
      } else {
        if ((window as any).electronAPI?.cancelStream) {
          (window as any).electronAPI.cancelStream().catch(() => {});
        }
        if ((window as any).electronAPI?.invoke) {
          (window as any).electronAPI.invoke('ai-stop').catch(() => {});
        }
      }
      return;
    }
    if (!inputPrompt.trim() && attachedFiles.length === 0) return;

    const userText = inputPrompt.trim();
    const currentAttachments = [...attachedFiles];
    setInputPrompt('');
    setAttachedFiles([]);

    playAction();

    // 1. Add user message
    const userMsgId = `user-msg-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      avatarType: 'user',
      content: userText || (currentAttachments.length > 0 ? `Shared ${currentAttachments.length} file(s)` : ''),
      attachments: currentAttachments.map((f) => ({ name: f.name, size: f.size })),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    addMessage(userMsg);
    setIsStreaming(true);

    if (activeMode === 'expert') {
      // 2. Expert Agent Mode
      const assistantMsgId = `hermes-msg-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        avatarType: selectedAgent ? 'akki' : 'robot',
        thinking: 'Thinking...',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      addMessage(assistantMsg);

      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          level: 'agent',
          message: `Expert Agent Task assigned: "${userText.slice(0, 40)}..."`,
        },
      ]);

      currentRunIdRef.current = null;
      const targetAgent = subAgents.find((a) => a.name === selectedAgent);

      // Build memory context
      let memoryContext = '';
      try {
        const storedProfile = localStorage.getItem('user_profile');
        const profile = storedProfile ? JSON.parse(storedProfile) : null;
        const storedMems = localStorage.getItem('akki_memories');
        const mems = storedMems ? JSON.parse(storedMems) : null;
        if (profile || (Array.isArray(mems) && mems.length > 0)) {
          const name = profile?.name || '';
          const loc = profile?.location || '';
          const prof = profile?.profession || '';
          const bio = profile?.bio || '';
          const profText = `Name: ${name}\nLocation: ${loc}\nProfession: ${prof}\nBio: ${bio}`;
          const memText =
            Array.isArray(mems) && mems.length > 0
              ? mems.map((m: any) => `- ${m.content || m.fact || ''}`).join('\n')
              : 'No stored memories.';
          memoryContext = `=== VOICE ASSISTANT MEMORY CONTEXT ===\nUser Profile:\n${profText}\n\nStored Memories:\n${memText}\n======================================\n\n`;
        }
      } catch {}

      const fullMessage = memoryContext + userText;
      const currentSession = sessions.find((s) => s.id === activeChatId);
      const sessionKey = currentSession?.sessionId ?? activeChatId;

      try {
        if (wsClientRef.current && wsClientRef.current.status === 'connected') {
          const res = await wsClientRef.current.request('chat.send', {
            sessionKey,
            message: fullMessage,
            idempotencyKey: userMsgId,
            ...(targetAgent ? { seatLabel: targetAgent.name, seatRole: targetAgent.role } : {}),
          });
          if (res.payload?.runId) {
            currentRunIdRef.current = res.payload.runId;
          }
        } else {
          // Fallback: assign via Electron IPC
          if ((window as any).electronAPI?.assignAgentTask) {
            const task = await (window as any).electronAPI.assignAgentTask({
              agentName: targetAgent?.name || 'Leo',
              title: userText.slice(0, 50),
              description: fullMessage,
            });
            if (task) {
              currentRunIdRef.current = task.id;
              if (task.result) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: task.result || '', thinking: undefined } : m
                  )
                );
                setIsStreaming(false);
              }
            }
          } else {
            throw new Error('Hermes Bridge is not connected (Port 18789)');
          }
        }
      } catch (err: any) {
        console.error('Expert chat send error:', err);
        let handledByFallback = false;
        if ((window as any).electronAPI?.assignAgentTask) {
          try {
            const task = await (window as any).electronAPI.assignAgentTask({
              agentName: targetAgent?.name || 'Leo',
              title: userText.slice(0, 50),
              description: fullMessage,
            });
            if (task) {
              currentRunIdRef.current = task.id;
              if (task.result) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: task.result || '', thinking: undefined } : m
                  )
                );
                setIsStreaming(false);
              }
              handledByFallback = true;
            }
          } catch {}
        }
        if (!handledByFallback) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Failed to invoke Expert Agent: ${err.message}`, thinking: undefined }
                : m
            )
          );
          setIsStreaming(false);
        }
      }
      return;
    }

    // 3. Voice Assistant Mode
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `User Query sent: "${userText.slice(0, 40)}..."`,
      },
    ]);

    try {
      if ((window as any).electronAPI?.generateStream) {
        const result = await (window as any).electronAPI.generateStream({
          prompt: userText,
          history: messages,
          thinkingEnabled,
          attachments: currentAttachments,
        });

        const content =
          typeof result === 'string'
            ? result
            : result?.content || 'Acknowledged and processed.';
        const thinking = typeof result === 'object' ? result?.thinking : undefined;
        const toolCalls =
          typeof result === 'object' && Array.isArray(result?.toolCalls)
            ? result.toolCalls
            : undefined;

        const toolTraces: ToolTrace[] | undefined =
          toolCalls && toolCalls.length > 0
            ? toolCalls.map((tc: any) => ({
                name: tc.toolName || tc.name || 'tool',
                success: tc.status === 'success' || (!tc.error && tc.status !== 'error'),
                durationMs: Math.round((tc.executionTimeSec || 0.5) * 1000),
                outcome:
                  tc.output !== undefined
                    ? typeof tc.output === 'object'
                      ? JSON.stringify(tc.output, null, 2)
                      : String(tc.output)
                    : tc.error || 'Execution completed',
              }))
            : undefined;

        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          avatarType: 'akki',
          thinking: thinkingEnabled ? thinking : undefined,
          toolCalls,
          toolTraces,
          content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        addMessage(assistantMsg);

        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((tc: any) => {
            const toolName = tc.toolName || tc.name || 'tool';
            const durationSec =
              tc.executionTimeSec != null
                ? `${Number(tc.executionTimeSec).toFixed(1)}s`
                : '0.8s';
            setLogs((prev) => {
              if (
                prev.some(
                  (l) =>
                    l.toolName === toolName &&
                    Date.now() - parseInt(l.id.split('-')[1] || '0') < 3000
                )
              ) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  timestamp: new Date().toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  level: tc.status === 'error' || tc.error ? 'error' : 'tool',
                  toolName,
                  duration: durationSec,
                  durationMs: Math.round((tc.executionTimeSec || 0.8) * 1000),
                  message: `Module: ${toolName}`,
                  details: {
                    params: tc.params || tc.args,
                    output: tc.output,
                  },
                },
              ];
            });
          });
        }
      } else {
        // Fallback simulation
        setTimeout(() => {
          const sampleTools: ToolExecutionSummary[] = [
            {
              id: `tool-${Date.now()}`,
              toolName: 'web_search',
              executionTimeSec: 0.6,
              status: 'success',
              output: { query: userText, resultsFound: 3 },
            },
          ];
          setLogs((prev) => [
            ...prev,
            {
              id: `log-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString([], {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              level: 'tool',
              toolName: 'web_search',
              duration: '0.6s',
              durationMs: 600,
              message: 'Module: web_search',
              details: {
                params: { query: userText },
                output: { query: userText, resultsFound: 3 },
              },
            },
          ]);
          addMessage({
            id: `msg-${Date.now() + 1}`,
            sender: 'assistant',
            avatarType: 'akki',
            thinking: thinkingEnabled
              ? `Processing user query: "${userText}"\nSynthesizing workspace context and preparing direct response.`
              : undefined,
            toolCalls: sampleTools,
            content: `Haan haan Akshay! Main yahan hoon. Tumhare sawal par research kar ke action le liya hai. ❤️`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
          setIsStreaming(false);
        }, 800);
        return;
      }
    } catch (err: any) {
      addMessage({
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        avatarType: 'robot',
        content: `Error: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          level: 'error',
          message: `Generation error: ${err.message}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'tool') return log.level === 'tool' || log.message.startsWith('Module:');
    return log.level === logFilter;
  });

  const currentAgent = subAgents.find((a) => a.name === selectedAgent);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b141b] rounded-[32px] border border-[rgba(0,229,255,0.10)] shadow-[0_0_40px_rgba(0,229,255,0.06),inset_0_1px_0_rgba(0,229,255,0.04)] relative overflow-hidden select-none">
      {/* Background scan-line */}
      <div className="absolute inset-0 bg-scan-line opacity-[0.02] pointer-events-none" />

      {/* ── Top Header: chats | logs Tabs + New session & History actions ── */}
      <div className="flex flex-col shrink-0 relative z-[60] border-b border-[rgba(0,229,255,0.08)] pt-6 pb-4 px-6">
        <div className="flex items-center justify-between gap-4">
          {/* Left tabs: chats & logs */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                playClick();
                setRightPanelTab('chats');
                if (viewMode === 'history') setViewMode('messages');
              }}
              className={`text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                rightPanelTab === 'chats' ? 'text-white' : 'text-white/20 hover:text-white/40'
              }`}
            >
              chats
            </button>
            <div className="h-3 w-[1px] bg-white/10" />
            <button
              onClick={() => {
                playClick();
                setRightPanelTab('logs');
              }}
              className={`text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                rightPanelTab === 'logs' ? 'text-white' : 'text-white/20 hover:text-white/40'
              }`}
            >
              logs
            </button>
          </div>

          {/* Right action buttons: only when in chats tab */}
          {rightPanelTab === 'chats' && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => {
                  playClick();
                  handleNewChat();
                }}
                className="text-white/30 hover:text-j-cyan transition-all"
                title="New session"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => {
                  playClick();
                  setViewMode(viewMode === 'history' ? 'messages' : 'history');
                }}
                className={`transition-all ${
                  viewMode === 'history' ? 'text-j-cyan' : 'text-white/30 hover:text-white/60'
                }`}
                title="View history"
              >
                <Clock size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Active Agent Banner (if selectedAgent exists) */}
        {currentAgent && rightPanelTab === 'chats' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[rgba(0,229,255,0.06)]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background:
                  currentAgent.status === 'busy'
                    ? '#00e5ff'
                    : currentAgent.status === 'offline'
                    ? '#f87171'
                    : '#6b7280',
              }}
            />
            <span className="text-[12px] font-bold text-white/90 truncate">{currentAgent.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-white/30 truncate">
              {currentAgent.role || 'Worker'} · {currentAgent.status || 'Idle'}
            </span>
            <span className="ml-auto flex items-center gap-2 text-[10px] shrink-0">
              <span className="text-emerald-400/80" title="Tasks done">
                ✓{' '}
                {
                  agentTasks.filter(
                    (t) => t.assignedTo === currentAgent.name && t.status === 'completed'
                  ).length
                }
              </span>
              <span
                className={
                  agentTasks.filter(
                    (t) => t.assignedTo === currentAgent.name && t.status === 'failed'
                  ).length > 0
                    ? 'text-red-400/80'
                    : 'text-white/25'
                }
                title="Tasks failed"
              >
                ✕{' '}
                {
                  agentTasks.filter(
                    (t) => t.assignedTo === currentAgent.name && t.status === 'failed'
                  ).length
                }
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ── Content Area: Messages Stream vs History vs Logs Terminal ── */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        {rightPanelTab === 'chats' ? (
          viewMode === 'history' ? (
            /* ── History Sessions List (Exact Old App HK) ─────────────── */
            <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 animate-in fade-in duration-700">
              <div className="flex items-center justify-between mb-8 px-1">
                <div className="flex flex-col gap-2">
                  <h3 className="text-[14px] font-bold uppercase tracking-[0.3em] text-white">
                    History Sessions
                  </h3>
                  <div className="h-[2px] w-12 bg-j-cyan shadow-[0_0_10px_rgba(0,229,255,0.4)]" />
                </div>
                <button
                  onClick={() => {
                    playClick();
                    handleNewChat();
                  }}
                  className="p-2 bg-white/[0.05] hover:bg-j-cyan/10 border border-white/10 hover:border-j-cyan/30 rounded-xl transition-all duration-300 group"
                  title="New Session"
                >
                  <Plus size={16} className="text-white/40 group-hover:text-j-cyan transition-colors" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {sessions.filter((s) => (s.chatMode || 'voice') === activeMode).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <MessageSquare size={24} className="mb-4 text-white/20" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/20">
                      Memory Void
                    </span>
                  </div>
                ) : (
                  sessions
                    .filter((s) => (s.chatMode || 'voice') === activeMode)
                    .map((session) => (
                    <div
                      key={session.id}
                      className={`group relative py-5 px-5 rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-between gap-4 border ${
                        activeChatId === session.id
                          ? 'bg-white/[0.06] border-j-cyan/40 shadow-xl'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                      }`}
                      onClick={() => {
                        playClick();
                        handleSwitchChat(session.id);
                      }}
                    >
                      {activeChatId === session.id && (
                        <div className="absolute left-0 top-4 bottom-4 w-1 bg-j-cyan rounded-r-full" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest ${
                              activeChatId === session.id ? 'text-j-cyan' : 'text-white/30'
                            }`}
                          >
                            {new Date(session.timestamp).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="text-[12px] font-medium text-white/80 truncate group-hover:text-white transition-colors">
                          {session.title || 'Untitled Session'}
                        </div>
                        <div className="text-[11px] text-white/30 truncate mt-1.5 group-hover:text-white/50 transition-colors">
                          {session.messages && session.messages.length > 0
                            ? session.messages[session.messages.length - 1]?.content?.slice(0, 50) ||
                              'Active conversation'
                            : 'No messages in session'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playClick();
                          handleDeleteChat(session.id);
                        }}
                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-white/10 hover:text-red-400 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ── Message Stream (Keeps the improved new bubble design) ── */
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className="flex flex-col space-y-1.5">
                  {/* User Message */}
                  {msg.sender === 'user' ? (
                    <div className="flex items-start space-x-2.5 justify-end">
                      <div className="flex flex-col items-end max-w-[85%]">
                        {/* Attached files previews in user message */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
                            {msg.attachments.map((file, idx) => (
                              <div
                                key={idx}
                                className="flex items-center space-x-1 bg-[#09141d] border border-[rgba(0,229,255,0.2)] px-2 py-1 rounded-lg text-[10px] text-gray-300 font-mono"
                              >
                                <File size={11} className="text-[#00e5ff]" />
                                <span className="truncate max-w-[120px]">{file.name}</span>
                                <span className="text-[9px] text-gray-500">
                                  ({formatFileSize(file.size)})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-[#0c1822] border border-[rgba(0,229,255,0.25)] text-gray-200 text-xs px-3.5 py-2.5 rounded-2xl rounded-tr-none shadow-[0_0_12px_rgba(0,229,255,0.1)] leading-relaxed">
                          {msg.content}
                        </div>
                        <span className="text-[9px] text-gray-500 mt-1 mr-1">{msg.timestamp}</span>
                      </div>
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-j-cyan/40 flex-shrink-0 mt-0.5">
                        <img
                          src="./branding/user_avatar.png"
                          alt="User"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Assistant Message Card */
                    <div className="flex flex-col space-y-2.5 bg-[#0b141b]/90 border border-[rgba(0,229,255,0.15)] rounded-xl p-3 shadow-[0_0_15px_rgba(0,229,255,0.06)]">
                      {/* Assistant Header */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(0,229,255,0.1)]">
                        <div className="flex items-center space-x-2">
                          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#00e5ff] to-[#0077ff] p-0.5 flex items-center justify-center">
                            <Bot size={13} className="text-black" />
                          </div>
                          <span className="font-['Orbitron',sans-serif] text-xs font-bold tracking-wider text-[#00e5ff]">
                            ✦ AKKI AI
                          </span>
                        </div>

                        {/* Sound Waveform Visualizer */}
                        <div className="flex items-end space-x-0.5 h-3">
                          {[40, 90, 60, 100, 50, 80].map((h, i) => (
                            <div
                              key={i}
                              className="w-0.5 bg-[#00e5ff] rounded-full animate-pulse"
                              style={{ height: `${h}%`, animationDelay: `${i * 150}ms` }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Thinking Tokens Accordion */}
                      {msg.thinking && (
                        <div className="bg-[#071017] border border-[rgba(0,229,255,0.15)] rounded-lg overflow-hidden text-[11px]">
                          <button
                            onClick={() => toggleThinkingCollapse(msg.id)}
                            className="w-full flex items-center justify-between p-2 bg-[#0a1622] hover:bg-[#0e1f30] transition-colors text-left"
                          >
                            <div className="flex items-center space-x-1.5 text-[9px] font-bold text-[#00e5ff] tracking-widest uppercase">
                              <Sparkles size={11} className="text-[#00e5ff]" />
                              <span>AI REASONING TOKENS</span>
                            </div>
                            {expandedThinking[msg.id] ? (
                              <ChevronDown size={13} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={13} className="text-gray-400" />
                            )}
                          </button>

                          {expandedThinking[msg.id] !== false && (
                            <p className="p-2.5 whitespace-pre-line text-gray-400 font-mono text-[10px] leading-relaxed border-t border-[rgba(0,229,255,0.1)]">
                              {msg.thinking}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Tool Invocation Traces (Exact Old App Parity sK) */}
                      {((msg.toolTraces && msg.toolTraces.length > 0) || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                        <div className="flex flex-col gap-1 w-full mt-1 mb-1 relative z-10 pl-1 max-w-full self-start">
                          {(msg.toolTraces && msg.toolTraces.length > 0
                            ? msg.toolTraces
                            : (msg.toolCalls || []).map((tc: any) => ({
                                name: tc.toolName || tc.name || 'tool',
                                success: tc.status === 'success' || (!tc.error && tc.status !== 'error'),
                                durationMs: Math.round((tc.executionTimeSec || 0.5) * 1000),
                                outcome:
                                  tc.output !== undefined
                                    ? typeof tc.output === 'object'
                                      ? JSON.stringify(tc.output, null, 2)
                                      : String(tc.output)
                                    : tc.error || 'Executed successfully',
                              }))
                          ).map((trace, idx) => {
                            const toolCall = msg.toolCalls?.find(
                              (call: any) =>
                                (call.function?.name || call.name || call.toolName) === trace.name
                            );
                            return (
                              <ToolTraceCard
                                key={`${msg.id}-trace-${idx}-${trace.name}`}
                                trace={trace}
                                toolCall={toolCall}
                              />
                            );
                          })}
                        </div>
                      )}

                      {/* Companion Speech Bubble */}
                      {msg.content ? (
                        <div className="flex items-start space-x-2.5 pt-1">
                          <div className="w-7 h-7 rounded-full overflow-hidden border border-[#c084fc] flex-shrink-0 mt-0.5">
                            <img
                              src="./branding/companion_avatar.png"
                              alt="Akki"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 bg-[#1a1138] border border-[#3b2568] text-gray-200 text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-[0_0_10px_rgba(59,37,104,0.3)] leading-relaxed">
                            {msg.content}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && (
                <div className="flex items-center space-x-2 text-xs text-[#00f0ff] p-2 bg-[#100b26] rounded-lg border border-[#261a45]">
                  <Sparkles size={13} className="animate-spin" />
                  <span>Akki is generating response & executing tools...</span>
                </div>
              )}
            </div>
          )
        ) : (
          /* ── Logs Terminal View (Exact Old App QK container) ──────── */
          <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
            <div className="flex-1 rounded-2xl overflow-hidden border border-white/5 bg-[#0a0d10] font-mono text-[11px] relative group shadow-2xl flex flex-col">
              {/* Header: Core_Log_Stream + Filter Toolbar */}
              <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)] animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">
                    Core_Log_Stream
                  </span>
                </div>

                {/* Filter Toolbar */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-1 text-[10px]">
                    {(['all', 'tool', 'info', 'error'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          playClick();
                          setLogFilter(filter);
                        }}
                        className={`px-2 py-0.5 rounded capitalize transition-colors font-mono text-[9px] ${
                          logFilter === filter
                            ? 'bg-j-cyan/20 text-j-cyan border border-j-cyan/40'
                            : 'bg-white/[0.02] text-white/40 hover:text-white/70 border border-white/5'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      playClick();
                      setLogs([]);
                    }}
                    className="text-white/30 hover:text-red-400 p-1 rounded transition-colors ml-1"
                    title="Clear Logs"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Logs Stream */}
              <div
                ref={logsScrollRef}
                className="flex-1 overflow-y-auto p-0 space-y-0 no-scrollbar scroll-smooth relative z-10 custom-scrollbar"
              >
                {filteredLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 gap-6 py-16">
                    <div className="w-16 h-16 border border-j-cyan/20 rounded-2xl flex items-center justify-center animate-pulse rotate-45">
                      <Terminal size={24} className="text-j-cyan -rotate-45" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <span className="uppercase tracking-[0.4em] text-[10px] font-bold text-j-cyan">
                        Awaiting_Neural_Signals
                      </span>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((m) => (
                          <div
                            key={m}
                            className="w-1 h-1 bg-j-cyan/40 rounded-full animate-bounce"
                            style={{ animationDelay: `${m * 150}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 divide-y divide-white/[0.02]">
                    {filteredLogs.map((log) => {
                      const isTool = log.level === 'tool' || log.message.startsWith('Module:');
                      const isExpanded = expandedLogIds.has(log.id);
                      const toolName =
                        log.toolName ||
                        (log.message.startsWith('Module:')
                          ? log.message.replace(/^Module:\s*/, '').trim()
                          : '');
                      const duration =
                        log.duration ||
                        (log.durationMs
                          ? `${(log.durationMs / 1000).toFixed(1)}s`
                          : isTool
                          ? '0.8s'
                          : undefined);

                      return (
                        <div
                          key={log.id}
                          onClick={() => {
                            if (log.details) {
                              playClick();
                              setExpandedLogIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(log.id)) next.delete(log.id);
                                else next.add(log.id);
                                return next;
                              });
                            }
                          }}
                          className={`group/log px-5 py-2.5 transition-all duration-200 hover:bg-white/[0.03] relative border-l-2 border-transparent hover:border-j-cyan/40 ${
                            log.details ? 'cursor-pointer' : ''
                          } ${
                            log.message.includes('AKKI SYSTEM')
                              ? 'bg-cyan-400/[0.03] border-y border-cyan-400/5 my-1'
                              : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Left: Timestamp, Module / Type, and Name */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="text-white/20 shrink-0 font-mono text-[9px] tabular-nums">
                                {log.timestamp}
                              </span>

                              {isTool ? (
                                <div className="flex items-center gap-2 text-[12px] font-medium min-w-0 truncate">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 border border-j-cyan/20 bg-j-cyan/5 text-cyan-400">
                                    <Sparkles size={11} className="text-cyan-400" />
                                  </div>
                                  <span className="text-white/40 whitespace-nowrap font-mono text-[11px]">
                                    Module:
                                  </span>
                                  <span className="text-white/90 font-mono font-medium tracking-wide bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.05] text-[11px] truncate">
                                    {toolName || log.message}
                                  </span>
                                  {log.level === 'error' && (
                                    <span className="text-red-400 text-[9px] uppercase font-bold tracking-widest bg-red-500/10 px-1.5 py-0.5 rounded-[4px] ml-1">
                                      Failed
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 shrink-0 min-w-[65px]">
                                    {log.level === 'error' && (
                                      <AlertCircle size={12} className="text-red-400" />
                                    )}
                                    {log.level === 'warning' && (
                                      <AlertTriangle size={12} className="text-amber-400" />
                                    )}
                                    {log.level === 'success' && (
                                      <CheckCircle2 size={12} className="text-green-400" />
                                    )}
                                    {log.level === 'info' && (
                                      <Info size={12} className="text-blue-400" />
                                    )}
                                    {log.level === 'agent' && (
                                      <Cpu size={12} className="text-cyan-400" />
                                    )}
                                    <span className="uppercase font-black text-[8px] tracking-[0.2em] opacity-60 text-white/50">
                                      {log.level}
                                    </span>
                                  </div>
                                  <span
                                    className={`leading-relaxed break-words font-medium tracking-tight text-[11px] truncate ${
                                      log.message.includes('AKKI SYSTEM')
                                        ? 'text-cyan-400 font-bold'
                                        : log.message.includes('Task Finished')
                                        ? 'text-green-400 font-bold'
                                        : log.level === 'error'
                                        ? 'text-red-400/90'
                                        : log.level === 'warning'
                                        ? 'text-amber-400/90'
                                        : log.level === 'agent'
                                        ? 'text-cyan-400/90'
                                        : 'text-white/70'
                                    }`}
                                  >
                                    {log.message}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right: Duration + Chevron */}
                            <div className="flex items-center gap-3 shrink-0 pl-2">
                              {duration && (
                                <div className="flex items-center gap-1.5 opacity-60">
                                  <Terminal size={12} className="text-white/40 hidden sm:block" />
                                  <span className="text-white/40 text-[10px] font-mono whitespace-nowrap">
                                    {duration}
                                  </span>
                                </div>
                              )}
                              <div className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 transition-colors text-white/40">
                                <ChevronRight
                                  size={13}
                                  className={`transition-transform duration-200 ${
                                    isExpanded
                                      ? 'rotate-90 text-cyan-400'
                                      : 'text-white/30 group-hover/log:text-white/70'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Expandable Details (Input Payload / Response Output or Metadata Dump) */}
                          {isExpanded && log.details && (
                            <div className="mt-3 p-3.5 bg-black/50 rounded-xl border border-white/5 text-[9px] overflow-x-auto shadow-inner group-hover/log:border-white/10 transition-colors animate-in fade-in duration-200 space-y-3">
                              {log.details.params &&
                                Object.keys(log.details.params).length > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 text-white/30 text-[9px] uppercase font-bold tracking-[0.15em]">
                                      <span className="w-1 h-1 bg-white/40 rounded-full" />
                                      <span>Input Payload</span>
                                    </div>
                                    <div className="bg-[#0a0d10] rounded-lg p-2.5 border border-white/5 overflow-x-auto custom-scrollbar">
                                      <pre className="text-[11px] font-mono text-white/60 leading-relaxed max-h-[140px] overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar">
                                        {typeof log.details.params === 'string'
                                          ? log.details.params
                                          : JSON.stringify(log.details.params, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}

                              {log.details.output !== undefined && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-j-cyan/50 text-[9px] uppercase font-bold tracking-[0.15em]">
                                    <span className="w-1 h-1 bg-cyan-400 rounded-full" />
                                    <span>Response Output</span>
                                  </div>
                                  <div className="bg-[#0a0d10] rounded-lg p-2.5 border border-j-cyan/20 overflow-x-auto custom-scrollbar">
                                    <pre className="text-[11px] font-mono text-j-cyan/80 leading-relaxed max-h-[220px] overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar">
                                      {typeof log.details.output === 'string'
                                        ? log.details.output
                                        : JSON.stringify(log.details.output, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {!log.details.params && log.details.output === undefined && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 mb-2 opacity-30">
                                    <span className="w-1 h-1 bg-cyan-400 rounded-full" />
                                    <span className="uppercase tracking-widest font-bold text-[8px] text-cyan-300">
                                      Metadata_Dump
                                    </span>
                                  </div>
                                  <pre className="whitespace-pre-wrap text-j-cyan/70 font-mono text-[11px] leading-tight">
                                    {typeof log.details === 'string'
                                      ? log.details
                                      : JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Hover gradient on the right */}
                          <div className="absolute right-0 top-0 bottom-0 w-[40px] bg-gradient-to-l from-j-cyan/[0.02] to-transparent opacity-0 group-hover/log:opacity-100 transition-opacity pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer: AKKI SYSTEM + Events Count */}
              <div className="px-5 py-3 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0 relative z-30">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">
                      AKKI SYSTEM
                    </span>
                    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">
                      Awaiting Command...
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[9px] font-black font-mono text-cyan-400/60 uppercase tracking-tighter">
                    {filteredLogs.length} EVENTS
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Input & Action Section (Exact Old App JK + oK) ─────── */}
      {rightPanelTab === 'chats' && viewMode === 'messages' && (
        <div className="flex flex-col shrink-0 bg-j-panel/40 border-t border-j-cyan/20">
          <div className="px-4 pt-3 pb-3 relative z-10 flex flex-col gap-2">
            {/* Attached Images/Files Previews */}
            {attachedFiles.length > 0 && (
              <div className="flex gap-2 px-1 overflow-x-auto no-scrollbar pb-1">
                {attachedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="relative group shrink-0 w-16 h-16 rounded-xl border border-white/10 bg-black/40 overflow-hidden shadow-lg animate-in fade-in zoom-in duration-300"
                  >
                    {file.data ? (
                      <img
                        src={
                          file.data.startsWith('data:')
                            ? file.data
                            : `data:${file.mimeType || 'image/png'};base64,${file.data}`
                        }
                        alt="preview"
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-[#151c24]">
                        <File size={16} className="text-[#00e5ff] mb-1" />
                        <span className="text-[8px] text-gray-300 truncate max-w-full font-mono">
                          {file.name}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-j-cyan/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    <button
                      onClick={() => handleRemoveAttachment(idx)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white/80 hover:bg-j-crimson hover:text-white transition-all scale-75 group-hover:scale-100"
                      title="Remove"
                    >
                      <Plus size={12} className="rotate-45" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea Box with dynamic border focus */}
            <div
              className={`rounded-2xl border border-white/10 bg-[#2c2f36] p-1.5 flex items-end gap-2 shadow-lg transition-all duration-300 mx-1 ${
                activeMode === 'voice'
                  ? 'focus-within:border-j-cyan/50 focus-within:shadow-[0_0_12px_rgba(0,229,255,0.15)] focus-within:bg-[#343741]'
                  : 'focus-within:border-indigo-500/50 focus-within:shadow-[0_0_12px_rgba(129,140,248,0.15)] focus-within:bg-[#343741]'
              }`}
              onPaste={handlePaste}
            >
              <textarea
                value={inputPrompt}
                onChange={(e) => {
                  setInputPrompt(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputPrompt.trim() || isStreaming || attachedFiles.length > 0) {
                      handleSendMessage();
                      e.currentTarget.style.height = 'auto';
                    }
                  }
                }}
                rows={1}
                style={{ height: 'auto', minHeight: '40px' }}
                placeholder={
                  isStreaming
                    ? 'Working...'
                    : activeMode === 'expert'
                    ? 'Type instruction for Expert Agent...'
                    : 'Type to Assistant (Gemini Live)...'
                }
                className="flex-1 bg-transparent text-[14px] text-white/90 placeholder:text-white/40 py-2.5 pl-3 outline-none resize-none no-scrollbar leading-relaxed bottom-chat-input-textarea font-medium"
              />

              <div className="flex flex-col gap-1 pb-0.5 pr-0.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSendMessage();
                    const textareaEl = document.querySelector(
                      '.bottom-chat-input-textarea'
                    ) as HTMLTextAreaElement | null;
                    if (textareaEl) textareaEl.style.height = 'auto';
                  }}
                  disabled={!inputPrompt.trim() && !isStreaming && attachedFiles.length === 0}
                  className={`h-9 w-9 shrink-0 rounded-[10px] flex items-center justify-center transition-all duration-300 ${
                    isStreaming
                      ? 'bg-red-500 hover:bg-red-600 text-white shadow-md'
                      : inputPrompt.trim() || attachedFiles.length > 0
                      ? 'bg-[#5b616b] hover:bg-[#727986] text-white shadow-md'
                      : 'bg-white/5 text-white/20 cursor-not-allowed'
                  }`}
                  title={isStreaming ? 'Halt operation' : 'Transmit signal'}
                >
                  {isStreaming ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <ArrowUp size={18} strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Sub-Input Mode Bar (Exact Old App oK) */}
          <div className="px-5 pb-3 pt-1 flex items-center justify-between gap-4">
            <div className="flex items-center bg-black/40 border border-white/5 rounded-full p-0.5 shadow-inner">
              <button
                onClick={() => {
                  switchMode('voice');
                }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  activeMode === 'voice'
                    ? 'bg-white/10 text-j-cyan shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
                title="Voice Assistant Mode"
              >
                <Zap size={11} />
                Voice Assistant
              </button>
              <button
                onClick={() => {
                  switchMode('expert');
                }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  activeMode === 'expert'
                    ? 'bg-white/10 text-indigo-400 shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
                title="Agent Town Partner"
              >
                <Bot size={11} />
                Expert Agent
              </button>
            </div>

            <div className="text-[10px] font-medium tracking-wide text-white/40 flex items-center gap-1.5 select-none">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  activeMode === 'expert'
                    ? wsStatus === 'connected'
                      ? 'bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(129,140,248,0.4)]'
                      : wsStatus === 'connecting'
                      ? 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                      : 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]'
                    : 'bg-j-cyan animate-pulse shadow-[0_0_6px_rgba(0,229,255,0.4)]'
                }`}
              />
              <span>
                {activeMode === 'expert'
                  ? wsStatus === 'connected'
                    ? 'Expert Agent Active'
                    : wsStatus === 'connecting'
                    ? 'Connecting Bridge...'
                    : 'Expert Agent Offline'
                  : 'Live Connected'}
              </span>
            </div>
          </div>

          {/* Pill Decor */}
          <div className="h-4 flex items-center justify-center opacity-10">
            <div className="w-6 h-[1px] bg-white rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
};
