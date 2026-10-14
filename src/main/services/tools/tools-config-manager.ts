/**
 * Tools Configuration Manager
 * Manages tools_config.json in userData directory.
 * Ported from reference electron/services/tools-config-manager.js
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { app } from 'electron';
import { DEFAULT_MODELS, TOOL_CONFIG_AVAILABLE_MODELS, BUILTIN_OPENROUTER_MODELS as CENTRAL_BUILTIN_OPENROUTER_MODELS } from '../../../shared/config/models';

const CONFIG_FILE = 'tools_config.json';
const GEMINI_MODELS_CACHE = 'cached_gemini_models.json';
const OPENROUTER_MODELS_CACHE = 'cached_openrouter_models.json';

export interface ToolModelConfig {
  model?: string;
  customModel?: string;
  usePrimaryApiKey?: boolean;
  customApiKey?: string;
  enableFallback?: boolean;
  fallbackModel?: string;
  isRetired?: boolean;
  provider?: string;
  token?: string;
  [key: string]: any;
}

export interface ToolsConfig {
  version: number;
  enableGlobalFallback: boolean;
  defaultGlobalFallbackModel: string;
  tools: Record<string, ToolModelConfig>;
}

export const DEFAULT_CONFIG: ToolsConfig = {
  version: 1,
  enableGlobalFallback: true,
  defaultGlobalFallbackModel: DEFAULT_MODELS.toolGlobal,
  tools: {
    web_search: {
      model: DEFAULT_MODELS.toolWebSearch,
      customModel: '',
      usePrimaryApiKey: true,
      customApiKey: '',
      enableFallback: true,
      fallbackModel: DEFAULT_MODELS.toolGlobal,
      isRetired: false,
    },
    whatsapp_transcribe: {
      model: DEFAULT_MODELS.toolWhatsapp,
      customModel: '',
      usePrimaryApiKey: true,
      customApiKey: '',
      enableFallback: true,
      fallbackModel: DEFAULT_MODELS.toolGlobal,
      isRetired: false,
    },
    dashboard_fetch: {
      model: DEFAULT_MODELS.toolDashboard,
      customModel: '',
      usePrimaryApiKey: true,
      customApiKey: '',
      enableFallback: true,
      fallbackModel: DEFAULT_MODELS.toolGlobal,
      isRetired: false,
    },
    subagent_runner: {
      model: DEFAULT_MODELS.toolSubagent,
      customModel: '',
      usePrimaryApiKey: true,
      customApiKey: '',
      enableFallback: true,
      fallbackModel: DEFAULT_MODELS.toolGlobal,
      isRetired: false,
    },
    voice_live: {
      model: DEFAULT_MODELS.toolVoiceLive,
      customModel: '',
      usePrimaryApiKey: true,
      customApiKey: '',
      enableFallback: false,
      fallbackModel: DEFAULT_MODELS.primary,
      isRetired: false,
    },
    image_generation: {
      provider: 'huggingface',
      model: 'black-forest-labs/FLUX.1-schnell',
      token: '',
    },
  },
};

export const BUILTIN_GEMINI_MODELS = [...TOOL_CONFIG_AVAILABLE_MODELS];

export const BUILTIN_OPENROUTER_MODELS = [...CENTRAL_BUILTIN_OPENROUTER_MODELS];

function getUserDataPath(): string {
  return app.getPath('userData');
}

function getConfigFilePath(): string {
  return path.join(getUserDataPath(), CONFIG_FILE);
}

/**
 * Reads tools_config.json from userData.
 * Returns merged default + stored config so new fields always exist.
 */
export function readConfig(): ToolsConfig {
  const configPath = getConfigFilePath();
  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const stored = JSON.parse(raw);
      const merged: ToolsConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      if (stored.enableGlobalFallback !== undefined) merged.enableGlobalFallback = stored.enableGlobalFallback;
      if (stored.defaultGlobalFallbackModel) merged.defaultGlobalFallbackModel = stored.defaultGlobalFallbackModel;
      if (stored.tools) {
        for (const toolKey of Object.keys(DEFAULT_CONFIG.tools)) {
          if (stored.tools[toolKey]) {
            merged.tools[toolKey] = Object.assign({}, DEFAULT_CONFIG.tools[toolKey], stored.tools[toolKey]);
          }
        }
      }
      return merged;
    }
  } catch (err: any) {
    console.error('[ToolsConfig] Failed to read config, using defaults:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * Writes config to tools_config.json in userData.
 */
export function writeConfig(config: any): boolean {
  const configPath = getConfigFilePath();
  try {
    const toWrite = { version: 1, ...config };
    fs.writeFileSync(configPath, JSON.stringify(toWrite, null, 2), 'utf8');
    return true;
  } catch (err: any) {
    console.error('[ToolsConfig] Failed to write config:', err.message);
    return false;
  }
}

/**
 * Returns the effective model for a given tool.
 * Uses customModel if set, otherwise falls back to model field.
 */
export function getEffectiveModel(toolKey: string): string {
  const config = readConfig();
  const tool = config.tools[toolKey];
  if (!tool) return config.defaultGlobalFallbackModel;
  const model = (tool.customModel && tool.customModel.trim()) ? tool.customModel.trim() : tool.model;
  return model || config.defaultGlobalFallbackModel;
}

/**
 * Marks a tool's model as retired and resets it to the global fallback.
 * Called automatically when a 404 / MODEL_NOT_FOUND error is detected at runtime.
 */
export function markModelRetired(toolKey: string): void {
  try {
    const config = readConfig();
    if (config.tools[toolKey]) {
      console.warn(`[ToolsConfig] Marking model as retired for tool: ${toolKey}`);
      config.tools[toolKey].isRetired = true;
      config.tools[toolKey].model = config.defaultGlobalFallbackModel;
      config.tools[toolKey].customModel = '';
      writeConfig(config);
    }
  } catch (err: any) {
    console.error('[ToolsConfig] Failed to mark model retired:', err.message);
  }
}

function httpsGet(url: string, options: any = {}): Promise<{ status?: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * Fetches live model list from Google Gemini API.
 * Caches result in userData/cached_gemini_models.json.
 * Falls back to cache, then to built-in list if API fails.
 */
export async function fetchGeminiModels(apiKey?: string): Promise<string[]> {
  const cachePath = path.join(getUserDataPath(), GEMINI_MODELS_CACHE);

  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const result = await httpsGet(url);
      if (result.status === 200) {
        const parsed = JSON.parse(result.body);
        const models = (parsed.models || [])
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))
          .filter(Boolean);

        if (models.length > 0) {
          fs.writeFileSync(cachePath, JSON.stringify({ updatedAt: Date.now(), models }, null, 2), 'utf8');
          console.log(`[ToolsConfig] Fetched ${models.length} Gemini models from API`);
          return models;
        }
      }
    } catch (err: any) {
      console.warn('[ToolsConfig] Gemini model fetch failed:', err.message);
    }
  }

  // Try cache
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached.models && cached.models.length > 0) {
        console.log('[ToolsConfig] Using cached Gemini models');
        return cached.models;
      }
    } catch (_) {}
  }

  // Fallback to built-in list
  console.log('[ToolsConfig] Using built-in Gemini model list');
  return BUILTIN_GEMINI_MODELS;
}

/**
 * Fetches live model list from OpenRouter public API.
 * Caches result in userData/cached_openrouter_models.json.
 * Falls back to cache, then to built-in list if API fails.
 */
export async function fetchOpenRouterModels(): Promise<string[]> {
  const cachePath = path.join(getUserDataPath(), OPENROUTER_MODELS_CACHE);

  try {
    const result = await httpsGet('https://openrouter.ai/api/v1/models', {
      headers: { 'User-Agent': 'AkkiAI/1.0' },
    });
    if (result.status === 200) {
      const parsed = JSON.parse(result.body);
      const models = (parsed.data || []).map((m: any) => m.id).filter(Boolean);
      if (models.length > 0) {
        fs.writeFileSync(cachePath, JSON.stringify({ updatedAt: Date.now(), models }, null, 2), 'utf8');
        console.log(`[ToolsConfig] Fetched ${models.length} OpenRouter models from API`);
        return models;
      }
    }
  } catch (err: any) {
    console.warn('[ToolsConfig] OpenRouter model fetch failed:', err.message);
  }

  // Try cache
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached.models && cached.models.length > 0) {
        console.log('[ToolsConfig] Using cached OpenRouter models');
        return cached.models;
      }
    } catch (_) {}
  }

  console.log('[ToolsConfig] Using built-in OpenRouter model list');
  return BUILTIN_OPENROUTER_MODELS;
}
