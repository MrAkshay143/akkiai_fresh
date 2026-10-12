import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  FileCode,
  RotateCcw,
  Plus,
  Paperclip,
  ArrowUp,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  Brain,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  File,
  X,
  Trash2,
  Filter
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import { ChatMessage, ToolExecutionSummary } from '@shared/types';

interface AttachedFile {
  name: string;
  size: number;
  content?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'tool' | 'error' | 'agent';
  message: string;
  details?: string;
}

export const ChatDrawer: React.FC = () => {
  const {
    rightPanelTab,
    setRightPanelTab,
    messages,
    addMessage,
    clearMessages,
    isStreaming,
    setIsStreaming,
  } = useAppStore();

  const { playClick, playHover, playAction } = useAudio();

  const [inputPrompt, setInputPrompt] = useState('');
  const [activeMode, setActiveMode] = useState<'voice' | 'expert'>('voice');
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        // Append log
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

  // Attachment handling
  const handleAttachClick = () => {
    playClick();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: AttachedFile[] = [];
    Array.from(files).forEach((file) => {
      newAttachments.push({
        name: file.name,
        size: file.size,
      });
    });

    setAttachedFiles((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    playClick();
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
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
    if ((!inputPrompt.trim() && attachedFiles.length === 0) || isStreaming) return;

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

  return (
    <div className="flex flex-col h-full bg-[#0b141b] rounded-[2rem] border border-[rgba(0,229,255,0.10)] shadow-[0_0_40px_rgba(0,229,255,0.06),inset_0_1px_0_rgba(0,229,255,0.04)] relative overflow-hidden backdrop-blur-md select-none">
      {/* ── Top Tabs: Chats vs Logs + Thinking Toggle ────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#070e14]/60 border-b border-[rgba(0,229,255,0.08)]">
        <div className="flex items-center space-x-1 bg-[#050c12]/80 p-0.5 rounded-lg border border-white/[0.06]">
          <button
            onClick={() => {
              playClick();
              setRightPanelTab('chats');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold tracking-wider transition-all ${
              rightPanelTab === 'chats'
                ? 'bg-j-cyan/15 text-j-cyan border border-j-cyan/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            <MessageSquare size={13} />
            <span>CHATS</span>
          </button>
          <button
            onClick={() => {
              playClick();
              setRightPanelTab('logs');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold tracking-wider transition-all ${
              rightPanelTab === 'logs'
                ? 'bg-j-cyan/15 text-j-cyan border border-j-cyan/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            <FileCode size={13} />
            <span>LOGS ({logs.length})</span>
          </button>
        </div>

        {/* Thinking Tokens Toggle & Controls */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              playClick();
              setThinkingEnabled(!thinkingEnabled);
            }}
            title={thinkingEnabled ? 'Thinking Tokens: Enabled' : 'Thinking Tokens: Disabled'}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono transition-all border ${
              thinkingEnabled
                ? 'bg-j-cyan/10 border-j-cyan/40 text-j-cyan shadow-[0_0_8px_rgba(0,229,255,0.2)]'
                : 'bg-black/20 border-white/10 text-white/40'
            }`}
          >
            <Brain size={11} className={thinkingEnabled ? 'animate-pulse' : ''} />
            <span>THINK {thinkingEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => {
              playClick();
              clearMessages();
            }}
            className="text-white/40 hover:text-white/80 p-1 rounded hover:bg-white/5 transition-colors"
            title="Clear Chat History"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {rightPanelTab === 'chats' ? (
        <>
          {/* ── Message Stream ────────────────────────────────────────── */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3.5">
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
                                  <strong className="text-white font-semibold">{tool.toolName}</strong>
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

          {/* ── Attached File Chips ───────────────────────────────────── */}
          {attachedFiles.length > 0 && (
            <div className="px-3 pt-2 bg-[#100a26] border-t border-[#261a45] flex flex-wrap gap-1.5">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center space-x-1.5 bg-[#1a1038] border border-[#3d276b] px-2 py-1 rounded-lg text-[10px] text-gray-200"
                >
                  <File size={11} className="text-[#00f0ff]" />
                  <span className="truncate max-w-[140px] font-mono">{f.name}</span>
                  <button
                    onClick={() => handleRemoveAttachment(i)}
                    className="text-gray-400 hover:text-red-400 ml-1"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Bottom Input & Action Bar ────────────────────────────── */}
          <div className="p-3 bg-[#070e14]/90 border-t border-[rgba(0,229,255,0.08)] space-y-2">
            <form
              onSubmit={handleSendMessage}
              className="flex items-center space-x-2 bg-[#0b141b] border border-[rgba(0,229,255,0.15)] focus-within:border-[#00e5ff] rounded-xl px-3 py-2 transition-colors"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Type to Assistant (Gemini Live)..."
                className="bg-transparent border-none outline-none text-xs text-gray-200 placeholder-gray-500 flex-1"
              />

              {/* Attachment Picker */}
              <button
                type="button"
                onClick={handleAttachClick}
                className="text-gray-400 hover:text-[#00e5ff] p-1 transition-colors"
                title="Attach file / document"
              >
                <Paperclip size={14} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
                className="hidden"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={(!inputPrompt.trim() && attachedFiles.length === 0) || isStreaming}
                className="w-7 h-7 rounded-full bg-gradient-to-r from-[#00e5ff] to-[#0085ff] text-black font-bold flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-40 transition-all shadow-[0_0_10px_rgba(0,229,255,0.4)] flex-shrink-0"
              >
                <ArrowUp size={14} />
              </button>
            </form>

            {/* Bottom Mode Selectors */}
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => {
                    playClick();
                    setActiveMode('voice');
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                    activeMode === 'voice'
                      ? 'bg-j-cyan/20 text-j-cyan border border-j-cyan/40 shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                      : 'bg-[#09141d] text-gray-400 hover:text-gray-200 border border-white/10'
                  }`}
                >
                  <Zap size={11} />
                  <span>VOICE ASSISTANT</span>
                </button>

                <button
                  onClick={() => {
                    playClick();
                    setActiveMode('expert');
                  }}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-md font-bold transition-all ${
                    activeMode === 'expert'
                      ? 'bg-j-cyan/20 text-j-cyan border border-j-cyan/40 shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                      : 'bg-[#09141d] text-gray-400 hover:text-gray-200 border border-white/10'
                  }`}
                >
                  <span>EXPERT AGENT</span>
                </button>
              </div>

              <div className="flex items-center space-x-1 text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] shadow-[0_0_4px_#00e5ff]" />
                <span className="text-[9px]">Gemini Live Ready</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── LOGS TAB ─────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col p-3 font-mono text-[11px] overflow-hidden">
          {/* Logs Filter Toolbar */}
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,229,255,0.08)] mb-2">
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
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
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
      )}
    </div>
  );
};
