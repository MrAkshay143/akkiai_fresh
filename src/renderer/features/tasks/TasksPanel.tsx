import React, { useState } from 'react';
import {
  CheckSquare,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Edit3,
  ArrowLeft,
  Calendar
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { Priority, TaskCategory, NoteItem } from '@shared/types';

export const TasksPanel: React.FC = () => {
  const {
    leftPanelTab,
    setLeftPanelTab,
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
    deleteNote
  } = useAppStore();

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newCategory, setNewCategory] = useState<TaskCategory>('work');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'pending' && t.status !== 'pending') return false;
    if (taskFilter === 'completed' && t.status !== 'completed') return false;
    if (taskFilter === 'high' && t.priority !== 'high') return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addTask(newTitle.trim(), newPriority, newCategory);
    setNewTitle('');
  };

  const handleStartNewNote = () => {
    setCurrentNote(null);
    setNoteTitle('');
    setNoteContent('');
    setIsEditingNote(true);
  };

  const handleEditNote = (note: NoteItem) => {
    setCurrentNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setIsEditingNote(true);
  };

  const handleSaveNote = () => {
    if (!noteTitle.trim()) return;
    saveCurrentNote(noteTitle.trim(), noteContent);
    setIsEditingNote(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d091e]/80 border border-[#2b1f4a] rounded-xl p-3 shadow-[0_0_15px_rgba(15,10,35,0.6)] backdrop-blur-md">
      {/* ── Top Tabs: Tasks vs Notes ───────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-1.5 bg-[#140e2d] p-1 rounded-lg border border-[#2b1f4a]">
          <button
            onClick={() => setLeftPanelTab('tasks')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wider transition-all ${
              leftPanelTab === 'tasks'
                ? 'bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white shadow-[0_0_10px_rgba(157,78,221,0.5)] border border-[#c084fc]/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <CheckSquare size={13} />
            <span>TASKS</span>
          </button>
          <button
            onClick={() => setLeftPanelTab('notes')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-semibold tracking-wider transition-all ${
              leftPanelTab === 'notes'
                ? 'bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white shadow-[0_0_10px_rgba(157,78,221,0.5)] border border-[#c084fc]/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileText size={13} />
            <span>NOTES ({notes.length})</span>
          </button>
        </div>

        <button
          onClick={() => {
            if (leftPanelTab === 'notes') {
              handleStartNewNote();
            }
          }}
          title={leftPanelTab === 'notes' ? 'Create new note' : 'Add task'}
          className="w-7 h-7 rounded-lg bg-[#221745] hover:bg-[#342468] border border-[#432e7c] flex items-center justify-center text-[#c084fc] hover:text-white transition-all shadow-[0_0_8px_rgba(192,132,252,0.2)]"
        >
          <Plus size={14} />
        </button>
      </div>

      {leftPanelTab === 'tasks' ? (
        <>
          {/* Operations Status with Real System Metrics */}
          <div className="flex items-center justify-between px-1 mb-2.5">
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  pendingCount === 0
                    ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                    : 'bg-[#00f0ff] shadow-[0_0_8px_#00f0ff] animate-pulse'
                }`}
              />
              <span className="text-[11px] font-bold tracking-widest text-[#00f0ff] uppercase">
                {pendingCount === 0
                  ? 'OPERATIONS: ALL SYSTEMS NOMINAL'
                  : `OPERATIONS: ${pendingCount} ACTIVE OBJECTIVE${pendingCount > 1 ? 'S' : ''}`}
              </span>
            </div>
            <span className="text-[9px] font-mono text-gray-400 bg-[#160f33] px-2 py-0.5 rounded border border-[#2b1f4a]">
              {pendingCount} active • {completedCount} done
            </span>
          </div>

          {/* Filter Row 1 */}
          <div className="flex items-center space-x-1.5 mb-2 overflow-x-auto pb-0.5">
            {(['all', 'pending', 'completed', 'high'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTaskFilter(f)}
                className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full transition-all ${
                  taskFilter === f
                    ? 'bg-[#9d4edd] text-white shadow-[0_0_8px_rgba(157,78,221,0.5)]'
                    : 'bg-[#150f2f] text-gray-400 border border-[#2d2150] hover:text-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Filter Row 2 (Categories) */}
          <div className="flex items-center space-x-1.5 mb-3">
            {(['all', 'work', 'personal'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded transition-all ${
                  categoryFilter === c
                    ? 'bg-[#3b2a6b] text-[#c084fc] border border-[#6b4abf]'
                    : 'bg-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Add Task Input Row */}
          <form onSubmit={handleAddTask} className="flex items-center space-x-1.5 mb-3 bg-[#130d2e] border border-[#2f2055] rounded-lg p-1.5">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add new objective..."
              className="bg-transparent border-none outline-none text-xs text-gray-200 placeholder-gray-500 flex-1 px-1"
            />

            {/* Priority Tag Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextPriority: Record<Priority, Priority> = {
                  low: 'medium',
                  medium: 'high',
                  high: 'low',
                };
                setNewPriority(nextPriority[newPriority]);
              }}
              className="flex items-center space-x-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#332211] text-[#f59e0b] border border-[#85530b]"
            >
              <Zap size={9} />
              <span>{newPriority.toUpperCase()}</span>
            </button>

            {/* Category Tag Toggle */}
            <button
              type="button"
              onClick={() => {
                setNewCategory(newCategory === 'work' ? 'personal' : 'work');
              }}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1f1642] text-[#c084fc] border border-[#482e8f]"
            >
              {newCategory.toUpperCase()}
            </button>

            <button
              type="submit"
              className="w-6 h-6 rounded bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_8px_rgba(157,78,221,0.5)]"
            >
              <Plus size={13} />
            </button>
          </form>

          {/* Task List or All Systems Nominal */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#170e36] border border-[#3c2573] flex items-center justify-center text-[#c084fc] shadow-[0_0_15px_rgba(192,132,252,0.2)] mb-2.5">
                  <ShieldCheck size={26} />
                </div>
                <span className="font-['Orbitron',sans-serif] text-xs font-bold tracking-wider text-gray-200">
                  ALL SYSTEMS NOMINAL
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5 max-w-[200px]">
                  No active parameters queued for execution.
                </span>
              </div>
            ) : (
              filteredTasks.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start justify-between p-2 rounded-lg border transition-all ${
                    t.status === 'completed'
                      ? 'bg-[#100b24]/50 border-[#221740] opacity-60'
                      : 'bg-[#160f33] border-[#34225e] hover:border-[#5a399f]'
                  }`}
                >
                  <div className="flex items-start space-x-2 flex-1 min-w-0 mr-2">
                    <button
                      onClick={() => toggleTask(t.id)}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${
                        t.status === 'completed' ? 'text-emerald-400' : 'text-gray-500 hover:text-[#00f0ff]'
                      }`}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-xs text-gray-200 leading-snug break-words ${
                          t.status === 'completed' ? 'line-through text-gray-500' : ''
                        }`}
                      >
                        {t.title}
                      </span>
                      <div className="flex items-center space-x-1.5 mt-1">
                        <span
                          className={`text-[8px] font-bold px-1 rounded uppercase ${
                            t.priority === 'high'
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : t.priority === 'medium'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-blue-950 text-blue-400 border border-blue-800'
                          }`}
                        >
                          {t.priority}
                        </span>
                        <span className="text-[8px] text-gray-500 uppercase">{t.category}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTask(t.id)}
                    className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : isEditingNote ? (
        /* Notes Editor View */
        <div className="flex-1 flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsEditingNote(false)}
              className="flex items-center space-x-1 text-[11px] text-gray-400 hover:text-white"
            >
              <ArrowLeft size={12} />
              <span>Back to Notes List</span>
            </button>
            <span className="text-[10px] font-mono text-[#c084fc]">
              {currentNote ? 'EDITING NOTE' : 'NEW NOTE'}
            </span>
          </div>

          <input
            type="text"
            placeholder="Note Title..."
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            className="bg-[#140e2e] border border-[#2f2055] focus:border-[#c084fc] rounded-lg px-2.5 py-1.5 text-xs text-gray-100 outline-none"
            autoFocus
          />
          <textarea
            placeholder="Write markdown note content..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="bg-[#140e2e] border border-[#2f2055] focus:border-[#c084fc] rounded-lg p-2 text-xs text-gray-200 outline-none flex-1 resize-none font-mono"
          />
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsEditingNote(false)}
              className="flex-1 py-1.5 bg-[#1b1238] hover:bg-[#25194c] text-gray-300 text-xs font-semibold rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNote}
              className="flex-1 py-1.5 bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white text-xs font-semibold rounded-lg shadow-[0_0_8px_rgba(157,78,221,0.4)]"
            >
              Save Note
            </button>
          </div>
        </div>
      ) : (
        /* Notes List View */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
              SAVED MEMORIES & NOTES ({notes.length})
            </span>
            <button
              onClick={handleStartNewNote}
              className="text-[10px] font-bold text-[#c084fc] hover:text-white flex items-center space-x-0.5"
            >
              <Plus size={11} />
              <span>New Note</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <FileText size={24} className="text-gray-500 mb-2" />
                <span className="text-xs font-bold text-gray-300">No Notes Stored</span>
                <span className="text-[10px] text-gray-500 mt-0.5">
                  Click 'New Note' to save insights and scratchpads.
                </span>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="p-2.5 rounded-lg bg-[#140e2e] border border-[#2d1e50] hover:border-[#4d3388] transition-all flex items-start justify-between group"
                >
                  <div
                    onClick={() => handleEditNote(note)}
                    className="flex-1 min-w-0 cursor-pointer pr-2"
                  >
                    <div className="text-xs font-bold text-gray-200 truncate">{note.title}</div>
                    <div className="text-[10px] text-gray-400 line-clamp-2 mt-0.5 leading-snug">
                      {note.content || '(Empty note)'}
                    </div>
                    <div className="flex items-center space-x-1 text-[8px] font-mono text-gray-500 mt-1">
                      <Calendar size={8} />
                      <span>{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <button
                      onClick={() => handleEditNote(note)}
                      className="p-1 text-gray-400 hover:text-[#c084fc] transition-colors"
                      title="Edit note"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
