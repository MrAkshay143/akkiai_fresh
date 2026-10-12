import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  Shield,
  ToggleLeft,
  ToggleRight,
  Terminal,
  Globe,
  Cpu,
  Trash2,
  Plus,
  Check,
  Code2,
  Search,
  Sparkles,
  Layers
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

interface SkillItem {
  folderName: string;
  name: string;
  description: string;
  category: string;
  isCore: boolean;
  enabled: boolean;
  content?: string;
}

const DEFAULT_CORE_SKILLS: SkillItem[] = [
  {
    folderName: 'web_search',
    name: 'Web & Live Market Search',
    description: 'Autonomous multi-query web search, news aggregation, and live market intelligence.',
    category: 'Research',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'deep_search',
    name: 'Deep Page Reader (Jina)',
    description: 'Deep neural web scraping and markdown parsing via Jina AI reader.',
    category: 'Research',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'open_info_panel',
    name: 'Native HUD Info Windows',
    description: 'Spawns dedicated frameless cybernetic HUD windows for deep analytics and metrics.',
    category: 'System',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'fs_tools',
    name: 'Filesystem Safe Access',
    description: 'Controlled file reading, writing, and directory listing in the user workspace.',
    category: 'System',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'os_exec',
    name: 'Restricted Terminal Shell',
    description: 'Evaluates sandboxed terminal commands and PowerShell scripts with stdout capture.',
    category: 'System',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'agent_town',
    name: 'Sub-Agent Delegation',
    description: 'Delegates complex tasks across autonomous sub-agents: Leo, Rancho, Raju, and Chatur.',
    category: 'Agents',
    isCore: true,
    enabled: true,
  },
  {
    folderName: 'media_player',
    name: 'Neural Media & YouTube',
    description: 'Controls YouTube player popups, background audio streams, and audio reactive loops.',
    category: 'Media',
    isCore: true,
    enabled: true,
  },
];

export const SkillsModal: React.FC = () => {
  const { activeModal, setActiveModal } = useAppStore();
  const { playClick, playHover, playAccessGranted } = useAudio();

  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'core' | 'custom'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: '',
    description: '',
    category: 'Custom',
    content: '',
  });

  useEffect(() => {
    if (activeModal === 'skills') {
      loadSkills();
    }
  }, [activeModal]);

  const loadSkills = async () => {
    setLoading(true);
    try {
      if ((window as any).electronAPI?.skillsList) {
        const data = await (window as any).electronAPI.skillsList();
        if (Array.isArray(data) && data.length > 0) {
          setSkills(data);
          setLoading(false);
          return;
        }
      } else if ((window as any).electronAPI?.invoke) {
        const data = await (window as any).electronAPI.invoke('skills-list');
        if (Array.isArray(data) && data.length > 0) {
          setSkills(data);
          setLoading(false);
          return;
        }
      }
      // Fallback
      setSkills(DEFAULT_CORE_SKILLS);
    } catch (e) {
      console.warn('Failed to load skills:', e);
      setSkills(DEFAULT_CORE_SKILLS);
    } finally {
      setLoading(false);
    }
  };

  if (activeModal !== 'skills') return null;

  const toggleSkill = async (folderName: string, enabled: boolean, isCore: boolean) => {
    playClick();
    const newEnabled = !enabled;
    setSkills(
      skills.map((s) => (s.folderName === folderName ? { ...s, enabled: newEnabled } : s))
    );
    try {
      if ((window as any).electronAPI?.skillsToggle) {
        await (window as any).electronAPI.skillsToggle(folderName, newEnabled, isCore);
      } else if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('skills-toggle', {
          folderName,
          enabled: newEnabled,
          isCore,
        });
      }
    } catch (err) {
      console.warn('Failed to toggle skill:', err);
    }
  };

  const handleSaveSkill = async () => {
    if (!newSkill.name.trim() || !newSkill.content.trim()) return;
    playAccessGranted();
    const folderName = newSkill.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const skillToSave: SkillItem = {
      folderName,
      name: newSkill.name.trim(),
      description: newSkill.description.trim(),
      category: newSkill.category.trim() || 'Custom',
      isCore: false,
      enabled: true,
      content: newSkill.content.trim(),
    };

    try {
      if ((window as any).electronAPI?.skillsSave) {
        await (window as any).electronAPI.skillsSave(skillToSave);
      } else if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('skills-save', skillToSave);
      }
    } catch (err) {
      console.warn('Failed to save skill:', err);
    }

    setSkills([...skills.filter((s) => s.folderName !== folderName), skillToSave]);
    setNewSkill({ name: '', description: '', category: 'Custom', content: '' });
    setShowCreate(false);
  };

  const handleDeleteSkill = async (folderName: string, isCore: boolean) => {
    if (isCore) return;
    if (confirm(`Are you sure you want to delete custom skill "${folderName}"?`)) {
      playClick();
      try {
        if ((window as any).electronAPI?.skillsDelete) {
          await (window as any).electronAPI.skillsDelete(folderName, isCore);
        } else if ((window as any).electronAPI?.invoke) {
          await (window as any).electronAPI.invoke('skills-delete', { folderName, isCore });
        }
      } catch (err) {
        console.warn('Failed to delete skill:', err);
      }
      setSkills(skills.filter((s) => s.folderName !== folderName));
    }
  };

  const getIcon = (category: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('research')) return Globe;
    if (cat.includes('system') || cat.includes('code')) return Terminal;
    if (cat.includes('agent')) return Cpu;
    if (cat.includes('media')) return Shield;
    if (cat.includes('visual')) return Layers;
    return BookOpen;
  };

  const filteredSkills = skills.filter((s) => {
    if (activeTab === 'core' && !s.isCore) return false;
    if (activeTab === 'custom' && s.isCore) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b1222] border border-[#1b3d68] w-full max-w-2xl rounded-2xl shadow-[0_0_35px_rgba(0,240,255,0.25)] overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header HUD */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0e192f] border-b border-[#1b3459]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#3b82f6] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.4)]">
              <BookOpen size={16} className="text-black" />
            </div>
            <div>
              <h2 className="font-outfit text-sm font-bold tracking-wider text-[#00e5ff]">
                SKILLS & TOOL INTELLIGENCE
              </h2>
              <p className="text-[10px] text-gray-400 font-mono">
                System tool modules, automated pipelines, and custom capabilities
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            onMouseEnter={playHover}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#1b3459] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab & Search Bar */}
        <div className="px-5 py-3 bg-[#0c162a] border-b border-[#182f50] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-1 bg-[#09101e] p-0.5 rounded-lg border border-[#1b3356]">
            {[
              { id: 'all', label: `All (${skills.length})` },
              { id: 'core', label: `Core (${skills.filter((s) => s.isCore).length})` },
              { id: 'custom', label: `Custom (${skills.filter((s) => !s.isCore).length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  playClick();
                  setActiveTab(tab.id as any);
                }}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#0284c7] text-white shadow-[0_0_8px_rgba(2,132,199,0.5)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-[#09101e] border border-[#1b3356] rounded-lg px-2.5 py-1 text-xs text-gray-300 w-44">
              <Search size={12} className="text-gray-400 mr-1.5" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search skills..."
                className="bg-transparent border-none outline-none w-full text-[11px] text-gray-200 placeholder-gray-500"
              />
            </div>

            <button
              onClick={() => {
                playClick();
                setShowCreate(!showCreate);
              }}
              className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-[#00f0ff] to-[#0284c7] text-black text-xs font-bold rounded-lg shadow hover:brightness-110 transition-all flex-shrink-0"
            >
              <Plus size={13} />
              <span>{showCreate ? 'Close Form' : 'New Skill'}</span>
            </button>
          </div>
        </div>

        {/* Create Skill Form Drawer */}
        {showCreate && (
          <div className="p-4 bg-[#0d1b32] border-b border-[#1b3d68] space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#00f0ff] uppercase tracking-wider font-mono">
                Create New Custom Skill Module
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Skill Name (e.g. Stock Analyzer)"
                value={newSkill.name}
                onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                className="bg-[#08101f] border border-[#1f3d6b] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00f0ff]"
              />
              <input
                type="text"
                placeholder="Category (e.g. Finance, System, Scraper)"
                value={newSkill.category}
                onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                className="bg-[#08101f] border border-[#1f3d6b] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00f0ff]"
              />
            </div>
            <input
              type="text"
              placeholder="Short Description of capabilities..."
              value={newSkill.description}
              onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              className="w-full bg-[#08101f] border border-[#1f3d6b] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00f0ff]"
            />
            <textarea
              placeholder="Skill Markdown Instructions / Tool Definitions..."
              value={newSkill.content}
              onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
              rows={4}
              className="w-full bg-[#08101f] border border-[#1f3d6b] rounded-lg p-2.5 text-xs text-white font-mono outline-none focus:border-[#00f0ff] resize-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1 rounded text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSkill}
                disabled={!newSkill.name.trim() || !newSkill.content.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white transition-all disabled:opacity-40"
              >
                Save Custom Skill
              </button>
            </div>
          </div>
        )}

        {/* Skills List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[400px]">
          {loading ? (
            <div className="text-center text-[#00f0ff] py-8 text-xs font-mono">
              Loading authorized skills...
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center text-gray-500 py-10 text-xs font-mono">
              No skills found in this view.
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const Icon = getIcon(skill.category);
              return (
                <div
                  key={skill.folderName}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#0e1b32] border border-[#1c3963] hover:border-[#2f5d9f] transition-all"
                >
                  <div className="flex items-start space-x-3 flex-1 pr-3">
                    <div className="p-2 rounded-lg bg-[#08101f] text-[#00f0ff] border border-[#1c3861] mt-0.5">
                      <Icon size={16} />
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-gray-100">{skill.name}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#132747] text-[#38bdf8]">
                          {skill.category}
                        </span>
                        {skill.isCore ? (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/50 text-emerald-400">
                            CORE
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-700/50 text-purple-300">
                            CUSTOM
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 mt-1 leading-snug">
                        {skill.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {!skill.isCore && (
                      <button
                        onClick={() => handleDeleteSkill(skill.folderName, skill.isCore)}
                        className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete custom skill"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => toggleSkill(skill.folderName, skill.enabled, skill.isCore)}
                      className={`text-xl transition-colors ${
                        skill.enabled ? 'text-[#00f0ff]' : 'text-gray-600'
                      }`}
                      title={skill.enabled ? 'Disable Skill' : 'Enable Skill'}
                    >
                      {skill.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0d182e] border-t border-[#182f50] flex items-center justify-between">
          <div className="text-[10px] text-gray-500 font-mono">
            Directly connected to skillsService & ~/.hermes/skills/
          </div>
          <button
            onClick={() => {
              playClick();
              setActiveModal(null);
            }}
            onMouseEnter={playHover}
            className="px-5 py-1.5 rounded-lg text-xs font-bold bg-[#13284a] hover:bg-[#1b3766] text-gray-200 hover:text-white transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
