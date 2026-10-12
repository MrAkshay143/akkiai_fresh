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
  Loader2,
  ChevronDown,
  ChevronRight,
  File,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import { ChatMessage, ToolExecutionSummary } from '@shared/types';

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
  level: 'info' | 'tool' | 'error' | 'agent';
  message: string;
  details?: string;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
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
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('akki_chat_sessions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'session-default',
        title: 'New Session',
        timestamp: Date.now(),
        messages: [],
      },
    ];
  });
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    return localStorage.getItem('akki_active_chat_id') || 'session-default';
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [activeMode, setActiveMode] = useState<'voice' | 'expert'>('voice');
  const [thinkingEnabled] = useState(true);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

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
      timestamp: '11:41:00',
      level: 'tool',
      message: 'Tool registered: web_search, play_youtube_video, generate_diagram.',
    },
  ]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'tool' | 'error'>('all');

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Sync sessions with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('akki_chat_sessions', JSON.stringify(sessions));
      localStorage.setItem('akki_active_chat_id', activeChatId);
    } catch {}
  }, [sessions, activeChatId]);

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
        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            level: 'tool',
            message: `Tool Executed: ${result.toolName}`,
            details: JSON.stringify(result.output || {}),
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

  // New Chat Session handler
  const handleNewChat = useCallback(() => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session',
      timestamp: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveChatId(newId);
    clearMessages();
    setViewMode('messages');
  }, [clearMessages]);

  // Switch Chat Session handler
  const handleSwitchChat = useCallback(
    (chatId: string) => {
      const target = sessions.find((s) => s.id === chatId);
      if (target) {
        setActiveChatId(chatId);
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
          };
          setActiveChatId(fallback.id);
          clearMessages();
          return [fallback];
        }
        if (chatId === activeChatId) {
          const nextActive = filtered[0];
          setActiveChatId(nextActive.id);
          setMessages(nextActive.messages || []);
        }
        return filtered;
      });
    },
    [activeChatId, clearMessages, setMessages]
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
      if ((window as any).electronAPI?.invoke) {
        (window as any).electronAPI.invoke('ai-stop').catch(() => {});
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
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      avatarType: 'user',
      content: userText || (currentAttachments.length > 0 ? `Shared ${currentAttachments.length} file(s)` : ''),
      attachments: currentAttachments.map((f) => ({ name: f.name, size: f.size })),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    addMessage(userMsg);
    setIsStreaming(true);

    // Append to logs
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

        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'assistant',
          avatarType: 'akki',
          thinking: thinkingEnabled ? thinking : undefined,
          toolCalls,
          content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        addMessage(assistantMsg);
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
          timestamp: new Date().toLocaleTimeString(),
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
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <MessageSquare size={24} className="mb-4 text-white/20" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/20">
                      Memory Void
                    </span>
                  </div>
                ) : (
                  sessions.map((session) => (
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

                      {/* Tool Invocation Badges */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-col space-y-1.5">
                          {msg.toolCalls.map((tool) => (
                            <div
                              key={tool.id}
                              className="bg-[#09141d] border border-[rgba(0,229,255,0.18)] rounded-lg text-xs overflow-hidden"
                            >
                              <div
                                onClick={() => toggleToolCollapse(tool.id)}
                                className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-[#0e1f30] transition-colors"
                              >
                                <div className="flex items-center space-x-2">
                                  <Zap size={11} className="text-[#00e5ff]" />
                                  <span className="text-[10px] font-mono text-gray-300">
                                    Module:{' '}
                                    <strong className="text-white font-semibold">
                                      {tool.toolName}
                                    </strong>
                                  </span>
                                </div>

                                <div className="flex items-center space-x-2">
                                  <span className="text-[9px] font-mono text-gray-400 flex items-center space-x-0.5">
                                    <Clock size={9} />
                                    <span>{tool.executionTimeSec}s</span>
                                  </span>

                                  {tool.status === 'running' && (
                                    <Loader2 size={12} className="text-[#00f0ff] animate-spin" />
                                  )}
                                  {tool.status === 'success' && (
                                    <CheckCircle2 size={12} className="text-emerald-400" />
                                  )}
                                  {tool.status === 'error' && (
                                    <AlertTriangle size={12} className="text-red-400" />
                                  )}
                                </div>
                              </div>

                              {/* Tool output drawer */}
                              {expandedTools[tool.id] && Boolean(tool.output) && (
                                <div className="p-2 bg-[#090616] border-t border-[#23173d] text-[10px] font-mono text-gray-400 overflow-x-auto">
                                  <pre>{JSON.stringify(tool.output, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Companion Speech Bubble */}
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
            <div className="flex-1 rounded-2xl overflow-hidden border border-white/5 bg-black/20 shadow-inner p-3 flex flex-col font-mono text-[11px]">
              {/* Logs Filter Toolbar */}
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,229,255,0.08)] mb-2 shrink-0">
                <div className="flex items-center space-x-1 text-[10px]">
                  {(['all', 'info', 'tool', 'error'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        playClick();
                        setLogFilter(filter);
                      }}
                      className={`px-2 py-0.5 rounded capitalize transition-colors ${
                        logFilter === filter
                          ? 'bg-j-cyan/20 text-j-cyan border border-j-cyan/40'
                          : 'bg-[#09141d] text-gray-400 hover:text-gray-200 border border-white/5'
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
                  className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                  title="Clear Logs"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Logs Stream */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {filteredLogs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">No log entries.</div>
                ) : (
                  filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-1.5 rounded bg-[#100a26] border border-[#23173d] flex flex-col space-y-0.5"
                    >
                      <div className="flex items-center space-x-2 text-[10px]">
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        {log.level === 'info' && <span className="text-emerald-400">[INFO]</span>}
                        {log.level === 'agent' && <span className="text-[#00f0ff]">[AGENT]</span>}
                        {log.level === 'tool' && <span className="text-[#c084fc]">[TOOL]</span>}
                        {log.level === 'error' && <span className="text-red-400">[ERROR]</span>}
                        <span className="text-gray-200">{log.message}</span>
                      </div>
                      {log.details && (
                        <div className="text-[9px] text-gray-500 font-mono truncate pl-4">
                          {log.details}
                        </div>
                      )}
                    </div>
                  ))
                )}
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
                  playClick();
                  setActiveMode('voice');
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
                  playClick();
                  setActiveMode('expert');
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
                    ? 'bg-indigo-400 animate-pulse shadow-[0_0_6px_rgba(129,140,248,0.4)]'
                    : 'bg-j-cyan animate-pulse shadow-[0_0_6px_rgba(0,229,255,0.4)]'
                }`}
              />
              <span>{activeMode === 'expert' ? 'Expert Agent Active' : 'Live Connected'}</span>
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
