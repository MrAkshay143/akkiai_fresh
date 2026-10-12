import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  category: z.enum(['work', 'personal', 'general']),
  status: z.enum(['pending', 'in_progress', 'completed']),
  createdAt: z.string(),
  updatedAt: z.string(),
  dueDate: z.string().optional(),
});

export const NoteSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()).optional(),
});

export const AppSettingsSchema = z.object({
  primaryModel: z.string().default('gemini-3.8-flash'),
  geminiApiKey: z.string().default(''),
  openRouterApiKey: z.string().default(''),
  huggingFaceApiKey: z.string().default(''),
  picovoiceAccessKey: z.string().default(''),
  wakeWordEnabled: z.boolean().default(false),
  voiceProvider: z.enum(['browser', 'gemini_live', 'elevenlabs']).default('browser'),
  voiceAssistantMode: z.enum(['voice', 'expert']).default('voice'),
  selectedPersona: z.string().default('despina-caring'),
  customSystemPrompt: z.string().default(''),
  theme: z.enum(['cyberpunk-dark', 'cyberpunk-neon']).default('cyberpunk-dark'),
  soundEffectsEnabled: z.boolean().default(true),
  bgmEnabled: z.boolean().default(false),
});

export const InfoPanelSchema = z.object({
  panelId: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  theme: z.enum(['cyan', 'amber', 'crimson', 'emerald', 'blue']).default('cyan'),
});

export const ToolExecuteSchema = z.object({
  toolName: z.string().min(1),
  params: z.record(z.unknown()),
});

export const AssignAgentTaskSchema = z.object({
  agentName: z.enum(['Leo', 'Rancho', 'Raju', 'Chatur']).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
});
