import React, { useState } from 'react';
import {
  CheckSquare,
  FileText,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  Circle,
  Folder,
  ArrowLeft,
  Save,
  Search,
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import { Priority, TaskCategory, NoteItem } from '@shared/types';
import { WindyRadarWidget } from '../weather/WindyRadarWidget';

export const LeftPanel: React.FC = () => {
  const { playClick } = useAudio();
  const [activeTab, setActiveTab] = useState<'tasks' | 'notes'>('tasks');

  const {
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    taskFilter,
    setTaskFilter,
    categoryFilter,
    setCategoryFilter,
    notes,
    currentNote,
    setCurrentNote,
    saveCurrentNote,
    deleteNote,
  } = useAppStore();

  // Task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>('work');

  // Note form state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState('General');
  const [noteSearch, setNoteSearch] = useState('');

  // Task metrics
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'pending' && t.status !== 'pending') return false;
    if (taskFilter === 'completed' && t.status !== 'completed') return false;
    if (taskFilter === 'high' && t.priority !== 'high') return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    playClick();
    addTask(newTaskTitle.trim(), newTaskPriority, newTaskCategory);
    setNewTaskTitle('');
  };

  const handleStartNewNote = () => {
    playClick();
    setCurrentNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('General');
    setIsEditingNote(true);
  };

  const handleSelectNote = (note: NoteItem) => {
    playClick();
    setCurrentNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCategory(note.category || 'General');
    setIsEditingNote(true);
  };

  const handleSaveNote = () => {
    if (!noteTitle.trim()) return;
    playClick();
    saveCurrentNote(noteTitle.trim(), noteContent);
    setIsEditingNote(false);
  };

  const filteredNotes = notes.filter((n) => {
    if (!noteSearch.trim()) return true;
    const query = noteSearch.toLowerCase();
    return (
      (n.title || '').toLowerCase().includes(query) ||
      (n.content || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex w-full shrink-0 h-full flex-col relative overflow-hidden border border-[rgba(0,229,255,0.12)] bg-[#0b141b] rounded-[2rem] lg:rounded-[2.5rem] shadow-[0_0_40px_rgba(0,229,255,0.06),inset_0_1px_0_rgba(0,229,255,0.05)] group transition-all duration-300 hover:border-[rgba(0,229,255,0.20)]">
      {/* ── Top Cyber Sheen Line ───────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-[#00e5ff]/30 to-transparent" />
      </div>

      {/* ── 4 Cyber Corner Brackets ────────────────────────────────────── */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#00e5ff]/20 rounded-tl-[2rem] pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity z-10" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t border-r border-[#00e5ff]/20 rounded-tr-[2rem] pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity z-10" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b border-l border-[#00e5ff]/20 rounded-bl-[2rem] pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity z-10" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#00e5ff]/20 rounded-br-[2rem] pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity z-10" />

      {/* ── Cyber Matrix Grid Background ───────────────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,229,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* ── Top 2-Grid Tab Switcher: Tasks vs Notes ─────────────────────── */}
      <div className="relative z-10 flex-none px-4 pt-5 pb-1 bg-transparent">
        <div className="grid grid-cols-2 bg-[#090f14]/80 border border-white/[0.06] p-1 rounded-xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]">
          <button
            onClick={() => {
              playClick();
              setActiveTab('tasks');
            }}
            className={`py-2 flex items-center justify-center gap-2 text-[12px] font-mono tracking-widest uppercase rounded-lg transition-all duration-300 focus:outline-none focus:ring-0 ${
              activeTab === 'tasks'
                ? 'bg-white/[0.06] text-white border border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.4)] font-semibold'
                : 'text-white/40 hover:text-white/70 border border-transparent'
            }`}
          >
            <CheckSquare
              size={13}
              className={activeTab === 'tasks' ? 'text-[#00e5ff]' : 'text-white/20'}
            />
            Tasks
          </button>
          <button
            onClick={() => {
              playClick();
              setActiveTab('notes');
            }}
            className={`py-2 flex items-center justify-center gap-2 text-[12px] font-mono tracking-widest uppercase rounded-lg transition-all duration-300 focus:outline-none focus:ring-0 ${
              activeTab === 'notes'
                ? 'bg-white/[0.06] text-white border border-white/[0.08] shadow-[0_4px_12px_rgba(0,0,0,0.4)] font-semibold'
                : 'text-white/40 hover:text-white/70 border border-transparent'
            }`}
          >
            <FileText
              size={13}
              className={activeTab === 'notes' ? 'text-[#00e5ff]' : 'text-white/20'}
            />
            Notes
          </button>
        </div>
      </div>

      {/* ── Middle Scrollable Body (Tasks or Notes) ────────────────────── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden px-4 py-2">
        {activeTab === 'tasks' ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Progress bar if tasks exist */}
            {totalTasks > 0 && (
              <div className="mb-2 p-2 rounded-lg bg-[#070c12]/60 border border-white/[0.05]">
                <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                  <span className="text-white/50 flex items-center gap-1">
                    <CheckCircle2 size={11} className="text-[#00e5ff]" /> Progress
                  </span>
                  <span className="text-[#00e5ff] font-bold">
                    {completedCount}/{totalTasks} ({Math.round(progressPercent)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00e5ff] to-emerald-400 transition-all duration-300 shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Filter pills */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <div className="flex items-center gap-1 bg-[#070c12]/80 p-0.5 rounded-lg border border-white/[0.05]">
                {(['all', 'pending', 'completed', 'high'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      playClick();
                      setTaskFilter(f as any);
                    }}
                    className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded-md transition-all ${
                      taskFilter === f
                        ? 'bg-white/[0.08] text-[#00e5ff] font-bold shadow-sm'
                        : 'text-white/35 hover:text-white/70'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-[#070c12]/80 p-0.5 rounded-lg border border-white/[0.05]">
                {(['all', 'work', 'personal'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      playClick();
                      setCategoryFilter(cat as any);
                    }}
                    className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded-md transition-all ${
                      categoryFilter === cat
                        ? 'bg-white/[0.08] text-white font-bold'
                        : 'text-white/35 hover:text-white/70'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Task Input Form */}
            <form onSubmit={handleAddTask} className="mb-2.5">
              <div className="flex items-center gap-1.5 bg-[#070c12]/80 border border-white/[0.08] focus-within:border-[#00e5ff]/40 rounded-xl p-1.5 transition-colors">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Add a new objective..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-white/25 px-2 focus:outline-none"
                />

                {/* Priority Selector Pill */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setNewTaskPriority(
                      newTaskPriority === 'low'
                        ? 'medium'
                        : newTaskPriority === 'medium'
                        ? 'high'
                        : 'low'
                    );
                  }}
                  className={`px-2 py-1 rounded text-[8.5px] font-mono uppercase font-bold border transition-colors ${
                    newTaskPriority === 'high'
                      ? 'border-red-500/40 text-red-400 bg-red-500/10'
                      : newTaskPriority === 'medium'
                      ? 'border-amber-400/40 text-amber-300 bg-amber-400/10'
                      : 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10'
                  }`}
                  title="Cycle Priority: Low → Medium → High"
                >
                  {newTaskPriority}
                </button>

                {/* Category Selector Pill */}
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setNewTaskCategory(newTaskCategory === 'work' ? 'personal' : 'work');
                  }}
                  className="px-2 py-1 rounded text-[8.5px] font-mono uppercase font-bold border border-white/10 text-white/50 bg-white/5 hover:text-white transition-colors"
                  title="Toggle Category: Work ↔ Personal"
                >
                  {newTaskCategory}
                </button>

                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="w-7 h-7 rounded-lg bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] flex items-center justify-center transition-all disabled:opacity-20 disabled:pointer-events-none"
                >
                  <Plus size={14} />
                </button>
              </div>
            </form>

            {/* Scrollable Tasks List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center text-white/30 text-xs font-mono">
                  No tasks matching filter.
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all group ${
                      task.status === 'completed'
                        ? 'bg-black/20 border-white/[0.03] opacity-50'
                        : 'bg-[#070c12]/70 border-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div
                      onClick={() => {
                        playClick();
                        toggleTask(task.id);
                      }}
                      className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={14} className="text-[#00e5ff] shrink-0" />
                      ) : (
                        <Circle size={14} className="text-white/30 hover:text-[#00e5ff] shrink-0" />
                      )}
                      <span
                        className={`text-xs truncate font-sans ${
                          task.status === 'completed'
                            ? 'line-through text-white/30'
                            : 'text-white/80'
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span
                        className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          task.priority === 'high'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : task.priority === 'medium'
                            ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                            : 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30'
                        }`}
                      >
                        {task.priority}
                      </span>
                      <button
                        onClick={() => {
                          playClick();
                          deleteTask(task.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-red-400 transition-all"
                        title="Delete task"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Notes view */
          <div className="flex flex-col h-full overflow-hidden">
            {isEditingNote ? (
              <div className="flex flex-col h-full space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                  <button
                    onClick={() => {
                      playClick();
                      setIsEditingNote(false);
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-white/50 hover:text-white transition-colors"
                  >
                    <ArrowLeft size={12} /> Back
                  </button>
                  <button
                    onClick={handleSaveNote}
                    disabled={!noteTitle.trim()}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#00e5ff]/20 hover:bg-[#00e5ff]/30 text-[#00e5ff] text-[10px] font-mono tracking-wider uppercase font-bold transition-all disabled:opacity-20"
                  >
                    <Save size={11} /> Save
                  </button>
                </div>

                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note Title..."
                  className="bg-[#070c12]/80 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#00e5ff]/40"
                />

                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write note thoughts, instructions, or snippets..."
                  className="flex-1 bg-[#070c12]/80 border border-white/[0.08] rounded-xl p-3 text-xs text-white/80 placeholder-white/30 focus:outline-none focus:border-[#00e5ff]/40 resize-none custom-scrollbar"
                />
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Search & New Note Strip */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex-1 flex items-center gap-1.5 bg-[#070c12]/80 border border-white/[0.08] rounded-xl px-2.5 py-1">
                    <Search size={11} className="text-white/30" />
                    <input
                      type="text"
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      placeholder="Search notes..."
                      className="bg-transparent text-[11px] text-white placeholder-white/25 focus:outline-none w-full"
                    />
                  </div>

                  <button
                    onClick={handleStartNewNote}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#00e5ff]/15 hover:bg-[#00e5ff]/25 border border-[#00e5ff]/30 text-[#00e5ff] text-[10px] font-mono tracking-wider uppercase transition-all"
                  >
                    <Plus size={11} /> New Note
                  </button>
                </div>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {filteredNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center text-white/30 text-xs font-mono">
                      No notes found.
                    </div>
                  ) : (
                    filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-2.5 rounded-xl bg-[#070c12]/70 border border-white/[0.06] hover:border-white/[0.15] transition-all flex items-start justify-between group"
                      >
                        <div
                          onClick={() => handleSelectNote(note)}
                          className="flex-1 min-w-0 cursor-pointer pr-2"
                        >
                          <div className="text-xs font-bold text-white/90 truncate font-sans">
                            {note.title}
                          </div>
                          <div className="text-[10px] text-white/40 line-clamp-2 mt-0.5 leading-snug">
                            {note.content || '(Empty note)'}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[8.5px] font-mono text-white/30">
                            <span className="flex items-center gap-0.5">
                              <Calendar size={9} />
                              {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-0.5 text-[#00e5ff]/60">
                              <Folder size={9} />
                              {note.category || 'General'}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            playClick();
                            deleteNote(note.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-red-400 transition-all shrink-0"
                          title="Delete note"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Anchored Slot: Windy Radar Widget ───────────────────── */}
      <div className="relative z-10 px-4 pb-4 pt-1 shrink-0">
        <WindyRadarWidget />
      </div>
    </div>
  );
};
