// Centralized AI Models Configuration - Single Source of Truth
// All model IDs, default selections, suggestion lists, and migration mappings reside here.

export const DEFAULT_MODELS = {
  primary: 'gemini-3.8-flash', // Main text generation & system prompt engine
  live: 'gemini-3.1-flash-live-preview', // Real-time bidirectional Voice Assistant (Gemini Live WebSocket)
  agent: 'gemini-3.8-flash', // Sub-agent coordinator & task delegator
  agentTown: 'gemini-3.1-flash-lite', // Agent Town default engine
  toolGlobal: 'gemini-3.5-flash-lite', // Per-tool global fallback model
  toolWebSearch: 'gemini-3.5-flash-lite',
  toolWhatsapp: 'gemini-3.8-flash',
  toolDashboard: 'gemini-3.8-flash',
  toolSubagent: 'gemini-3.8-flash',
  toolVoiceLive: 'gemini-3.8-flash-exp',
  tts: 'gemini-3.8-flash-tts',
  ttsFallback: 'gemini-3.8-flash',
  openRouterPrimary: 'google/gemini-3.5-flash',
  openRouterSubAgent: 'google/gemini-3.1-flash-lite',
  codex: 'gpt-5.5',
  openAiPrimary: 'gpt-4o',
} as const;

export const GEMINI_SPEAK_CHANNEL = 'gemini-speak';

export const AVAILABLE_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  { id: 'gemini-3.8-flash-exp', name: 'Gemini 3.8 Flash Exp' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Free' },
] as const;

export const OPENROUTER_MODEL_SUGGESTIONS = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.5',
  'moonshotai/kimi-k2.5',
] as const;

export const GEMINI_MODEL_SUGGESTIONS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
] as const;

export const OPENAI_CODEX_MODEL_SUGGESTIONS = [
  'gpt-5.5',
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o3-mini',
] as const;

export const TOOL_CONFIG_AVAILABLE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-3.8-flash-exp',
  'google/gemini-3.8-flash',
] as const;

export const BUILTIN_OPENROUTER_MODELS = [
  'google/gemini-3.8-flash',
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-4o',
  'deepseek/deepseek-r1',
  'moonshotai/kimi-k2',
  'meta-llama/llama-3.3-70b-instruct',
] as const;

export const DEFAULT_OPENROUTER_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Free' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
] as const;

export const FALLBACK_RETRY_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
] as const;

export const DEPRECATED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

export function isDeprecatedModel(model: string | undefined | null): boolean {
  if (!model || typeof model !== 'string') return false;
  return DEPRECATED_MODELS.includes(model.trim() as any);
}

export function resolveActiveModel(
  model: string | undefined | null,
  fallback: string = DEFAULT_MODELS.primary
): string {
  if (!model || typeof model !== 'string' || !model.trim()) return fallback;
  const trimmed = model.trim();
  if (isDeprecatedModel(trimmed)) {
    return fallback;
  }
  return trimmed;
}
