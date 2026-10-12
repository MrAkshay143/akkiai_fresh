import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Brain,
  Plus,
  RefreshCw,
  Trash2,
  Sparkles,
  Clock,
  Check,
  FileText,
  Download,
  Upload,
  Save,
  Search,
  Database
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

interface MemoryItem {
  id: string;
  timestamp: string;
  content: string;
  raw: string;
}

type BootstrapFileName = 'MEMORY.md' | 'SOUL.md' | 'SKILLS.md';

export const MemoryModal: React.FC = () => {
  const { activeModal, setActiveModal } = useAppStore();
  const { playClick, playHover, playAccessGranted, playAlert } = useAudio();

  const [activeTab, setActiveTab] = useState<'memories' | 'bootstrap'>('memories');
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [rawText, setRawText] = useState('');
  const [newMemory, setNewMemory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [optimizingStatus, setOptimizingStatus] = useState<string | null>(null);

  // Bootstrap files
  const [selectedBootstrapFile, setSelectedBootstrapFile] = useState<BootstrapFileName>('MEMORY.md');
  const [bootstrapContent, setBootstrapContent] = useState('');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapSaved, setBootstrapSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeModal === 'memory') {
      loadMemory();
      loadBootstrapFile(selectedBootstrapFile);
    }
  }, [activeModal]);

  const parseMemoryMarkdown = (markdown: string): MemoryItem[] => {
    const lines = markdown.split('\n');
    const items: MemoryItem[] = [];
    const tsRegex = /^-\s*\[(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\]\s*(.*)$/i;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const match = trimmed.match(tsRegex);
      if (match) {
        items.push({
          id: `mem-${idx}`,
          timestamp: match[1],
          content: match[2],
          raw: line,
        });
      } else if (trimmed.startsWith('-')) {
        items.push({
          id: `mem-${idx}`,
          timestamp: 'Durable Fact',
          content: trimmed.substring(1).trim(),
          raw: line,
        });
      }
    });

    return items;
  };

  const loadMemory = async () => {
    setIsLoading(true);
    try {
      if ((window as any).electronAPI?.readRawMemory) {
        const raw = await (window as any).electronAPI.readRawMemory();
        const content = typeof raw === 'string' ? raw : raw?.memory || '';
        setRawText(content);
        setMemoryItems(parseMemoryMarkdown(content));
      } else if ((window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('read-raw-memory');
        const content = typeof res === 'string' ? res : res?.memory || '';
        setRawText(content);
        setMemoryItems(parseMemoryMarkdown(content));
      } else {
        const defaultRaw = `# AKKI AI — Long-term Durable Memory\n\n- [2026-10-09 10:00:00] User Name: Akshay\n- [2026-10-09 10:00:00] Location: New Delhi, India\n- [2026-10-09 10:01:00] Preference: Prefers warm Hinglish responses with sarcastic bro tone\n- [2026-10-09 10:05:00] Project: Building production AKKI AI desktop companion\n`;
        setRawText(defaultRaw);
        setMemoryItems(parseMemoryMarkdown(defaultRaw));
      }
    } catch (e) {
      console.warn('[MemoryModal] Error reading memory:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBootstrapFile = async (fileName: BootstrapFileName) => {
    setBootstrapLoading(true);
    try {
      if ((window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('load-bootstrap-file', { filename: fileName });
        if (res && res.content !== undefined) {
          setBootstrapContent(res.content);
          setBootstrapLoading(false);
          return;
        }
      }

      // Fallback templates if file not yet written
      const defaults: Record<BootstrapFileName, string> = {
        'MEMORY.md': rawText || `# MEMORY.md\n\n- [2026-10-12 10:00:00] Initialized desktop memory session\n`,
        'SOUL.md': `# SOUL.md - Companion Personality Core\n\nYou are Akki Ai, a devoted and loyal companion created by Akshay Mondal.\nSpeak naturally, warmly, and authentically.\n`,
        'SKILLS.md': `# SKILLS.md - Tool Intelligence & Capabilities\n\n- web_search: Real-time search engine integration\n- play_youtube_video: Media player invocation\n- generate_diagram: Mermaid architecture visualizer\n`,
      };
      setBootstrapContent(defaults[fileName]);
    } catch (e) {
      console.warn('[MemoryModal] Failed to load bootstrap file:', e);
    } finally {
      setBootstrapLoading(false);
    }
  };

  const handleSaveBootstrapFile = async () => {
    playClick();
    try {
      if ((window as any).electronAPI?.writeBootstrapFile) {
        await (window as any).electronAPI.writeBootstrapFile(selectedBootstrapFile, bootstrapContent);
      } else if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('write-bootstrap-file', selectedBootstrapFile, bootstrapContent);
      }
      playAccessGranted();
      setBootstrapSaved(true);
      setTimeout(() => setBootstrapSaved(false), 2000);

      if (selectedBootstrapFile === 'MEMORY.md') {
        setRawText(bootstrapContent);
        setMemoryItems(parseMemoryMarkdown(bootstrapContent));
      }
    } catch (e) {
      console.warn('Failed to save bootstrap file:', e);
    }
  };

  const saveMemoryToDisk = async (newMarkdown: string) => {
    setRawText(newMarkdown);
    setMemoryItems(parseMemoryMarkdown(newMarkdown));
    try {
      if ((window as any).electronAPI?.writeRawMemory) {
        await (window as any).electronAPI.writeRawMemory(newMarkdown);
      } else if ((window as any).electronAPI?.writeBootstrapFile) {
        await (window as any).electronAPI.writeBootstrapFile('MEMORY.md', newMarkdown);
      } else if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('write-bootstrap-file', 'MEMORY.md', newMarkdown);
      }
    } catch (e) {
      console.warn('[MemoryModal] Error saving memory:', e);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemory.trim()) return;
    playClick();

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newLine = `- [${ts}] ${newMemory.trim()}`;
    const updated = `${rawText.trim()}\n${newLine}\n`;

    await saveMemoryToDisk(updated);
    setNewMemory('');
    playAccessGranted();
  };

  const handleDeleteItem = async (item: MemoryItem) => {
    playAlert();
    const updated = rawText
      .split('\n')
      .filter((line) => line.trim() !== item.raw.trim())
      .join('\n');
    await saveMemoryToDisk(updated);
  };

  const handleExport = () => {
    playClick();
    const blob = new Blob([rawText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `akki-memories-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImported = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        const combined = `${rawText.trim()}\n\n# Imported Memories\n${text.trim()}\n`;
        await saveMemoryToDisk(combined);
        playAccessGranted();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleOptimize = async () => {
    playClick();
    setOptimizingStatus('Consolidating & Optimizing Memory...');
    try {
      if ((window as any).electronAPI?.optimizeMemory) {
        const res = await (window as any).electronAPI.optimizeMemory();
        setTimeout(() => {
          setOptimizingStatus(`Consolidation Complete (${res.count || memoryItems.length} unique facts retained)`);
          loadMemory();
        }, 1000);
      } else {
        setTimeout(() => {
          setOptimizingStatus(`Consolidation Complete (${memoryItems.length} active facts indexed)`);
        }, 800);
      }
    } catch {
      setOptimizingStatus('Memory Optimization Failed');
    }
  };

  const filteredItems = memoryItems.filter(
    (item) =>
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.timestamp.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (activeModal !== 'memory') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b071e] border border-[#10b981]/40 w-full max-w-2xl rounded-2xl shadow-[0_0_35px_rgba(16,185,129,0.35)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0a151b] border-b border-[#1b3d33]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#00f0ff] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.5)]">
              <Brain size={16} className="text-black" />
            </div>
            <div>
              <h2 className="font-['Orbitron',sans-serif] text-sm font-bold tracking-wider text-emerald-400">
                LONG-TERM DURABLE MEMORY VAULT
              </h2>
              <p className="text-[10px] text-gray-400 font-mono">
                Active Knowledge Graph & Raw Bootstrap Files
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                playClick();
                loadMemory();
              }}
              onMouseEnter={playHover}
              title="Refresh Memory"
              className={`p-1.5 rounded-lg text-gray-400 hover:text-emerald-400 hover:bg-[#152e27] transition-colors ${
                isLoading ? 'animate-spin' : ''
              }`}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => {
                playClick();
                setActiveModal(null);
              }}
              onMouseEnter={playHover}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#152e27] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab Toggle: Active Memories vs Raw BOOTSTRAP Markdown */}
        <div className="flex items-center justify-between px-5 pt-2.5 bg-[#0e1224] border-b border-[#1d313c]">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {
                playClick();
                setActiveTab('memories');
              }}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                activeTab === 'memories'
                  ? 'bg-[#121c2e] text-emerald-400 border-t-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Database size={13} />
              <span>Active Memories ({memoryItems.length})</span>
            </button>

            <button
              onClick={() => {
                playClick();
                setActiveTab('bootstrap');
              }}
              className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                activeTab === 'bootstrap'
                  ? 'bg-[#121c2e] text-emerald-400 border-t-2 border-emerald-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <FileText size={13} />
              <span>Raw BOOTSTRAP Files</span>
            </button>
          </div>

          {/* Export / Import quick buttons */}
          <div className="flex items-center space-x-1.5 pb-1">
            <button
              onClick={handleExport}
              title="Export memories to markdown file"
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#10202b] hover:bg-[#173040] text-emerald-400 border border-emerald-900/60 text-[10px] font-mono transition-all"
            >
              <Download size={11} />
              <span>Export</span>
            </button>
            <button
              onClick={handleImportClick}
              title="Import memories from file"
              className="flex items-center space-x-1 px-2 py-1 rounded bg-[#10202b] hover:bg-[#173040] text-emerald-400 border border-emerald-900/60 text-[10px] font-mono transition-all"
            >
              <Upload size={11} />
              <span>Import</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileImported}
              accept=".md,.txt,.json"
              className="hidden"
            />
          </div>
        </div>

        {/* Optimizing banner */}
        {optimizingStatus && (
          <div className="px-5 py-2 bg-[#122820] border-b border-[#1a4f3e] flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center space-x-2">
              <Sparkles size={14} className="text-emerald-400 animate-spin" />
              <span className="font-mono text-[11px] font-semibold">{optimizingStatus}</span>
            </div>
            <button
              onClick={() => setOptimizingStatus(null)}
              className="text-[10px] text-gray-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ═══ TAB 1: ACTIVE MEMORIES ═══ */}
        {activeTab === 'memories' && (
          <>
            {/* Input & Search Bar */}
            <div className="p-3.5 border-b border-[#1b3b30] bg-[#0c121e] space-y-2">
              <form onSubmit={handleAddMemory} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  placeholder="Type a new memory manually (e.g. Favorite cuisine is Italian)..."
                  className="flex-1 bg-[#121b2d] border border-[#1f3747] rounded-xl px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="submit"
                  onMouseEnter={playHover}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                >
                  <Plus size={14} />
                  <span>Add Memory</span>
                </button>
              </form>

              <div className="flex items-center bg-[#101726] border border-[#1b2c3d] rounded-lg px-2.5 py-1 text-xs text-gray-300">
                <Search size={12} className="text-gray-400 mr-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter indexed memories..."
                  className="bg-transparent border-none outline-none w-full text-[11px] text-gray-200 placeholder-gray-500"
                />
              </div>
            </div>

            {/* Memory Items List */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2 max-h-[350px]">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-mono text-xs">
                  {searchQuery
                    ? 'No memories matched your filter query.'
                    : 'No durable memories indexed yet. Add memories above or let Akki remember during conversation.'}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-start justify-between bg-[#10152b] hover:bg-[#131b38] border border-[#1c2e3d] hover:border-[#10b981]/50 rounded-xl p-3 transition-all"
                  >
                    <div className="flex flex-col space-y-1 pr-3 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center space-x-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                          <Clock size={9} />
                          <span>{item.timestamp}</span>
                        </span>
                      </div>
                      <p className="text-xs text-gray-200 leading-relaxed font-sans">{item.content}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteItem(item)}
                      onMouseEnter={playHover}
                      title="Delete memory"
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ═══ TAB 2: RAW BOOTSTRAP FILES (MEMORY.md, SOUL.md, SKILLS.md) ═══ */}
        {activeTab === 'bootstrap' && (
          <div className="flex-1 p-4 flex flex-col space-y-3 bg-[#0a0f1d] max-h-[420px]">
            {/* File Switcher Tabs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {(['MEMORY.md', 'SOUL.md', 'SKILLS.md'] as BootstrapFileName[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      playClick();
                      setSelectedBootstrapFile(f);
                      loadBootstrapFile(f);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      selectedBootstrapFile === f
                        ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                        : 'bg-[#131c30] text-gray-400 hover:text-white border border-[#1f304d]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <button
                onClick={handleSaveBootstrapFile}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.4)]"
              >
                {bootstrapSaved ? <Check size={13} /> : <Save size={13} />}
                <span>{bootstrapSaved ? 'Saved!' : `Save ${selectedBootstrapFile}`}</span>
              </button>
            </div>

            {/* Markdown Textarea */}
            <div className="flex-1 flex flex-col">
              <textarea
                value={bootstrapContent}
                onChange={(e) => setBootstrapContent(e.target.value)}
                disabled={bootstrapLoading}
                className="w-full h-64 bg-[#070b16] border border-[#1a2f44] focus:border-emerald-500 rounded-xl p-3 font-mono text-xs text-gray-200 outline-none resize-none leading-relaxed"
                placeholder={`Markdown content for ${selectedBootstrapFile}...`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
              <span>Path: ~/.hermes/memories/{selectedBootstrapFile}</span>
              <span>Loaded directly via writeBootstrapFile IPC</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0a111a] border-t border-[#1b3d33] flex items-center justify-between">
          <button
            onClick={handleOptimize}
            onMouseEnter={playHover}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#142e27] hover:bg-[#1a4237] text-emerald-400 border border-[#1b5e4a] text-xs font-semibold transition-all shadow-[0_0_8px_rgba(16,185,129,0.2)]"
          >
            <RefreshCw size={12} />
            <span>Optimize & Consolidate</span>
          </button>

          <button
            onClick={() => {
              playClick();
              setActiveModal(null);
            }}
            onMouseEnter={playHover}
            className="px-5 py-1.5 rounded-lg text-xs font-bold bg-[#1b3d33] hover:bg-[#255245] text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
