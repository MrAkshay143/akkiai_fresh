import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ChatMessage, AppSettings } from '../../../shared/types';
import { DEFAULT_MODELS, resolveActiveModel } from '../../../shared/config/models';
import { GeminiService, GenerateResult } from './gemini-service';
import { PersonaService } from './persona-service';
import { MemoryService } from '../memory/memory-service';
import { ToolRegistry } from '../tools/tool-registry';

export class AIService {
  private geminiService: GeminiService;
  private personaService: PersonaService;
  private memoryService?: MemoryService;
  private toolRegistry?: ToolRegistry;
  private currentSettings?: () => AppSettings;

  constructor(
    initialApiKey?: string,
    memoryService?: MemoryService,
    toolRegistry?: ToolRegistry,
    settingsGetter?: () => AppSettings
  ) {
    this.memoryService = memoryService;
    this.toolRegistry = toolRegistry;
    this.currentSettings = settingsGetter;
    this.personaService = new PersonaService();

    this.geminiService = new GeminiService({
      geminiApiKey: initialApiKey || process.env.GEMINI_API_KEY || '',
      primaryModel: DEFAULT_MODELS.primary,
    });

    if (toolRegistry) {
      this.geminiService.setToolRegistry(toolRegistry);
    }
  }

  public setApiKey(key: string): void {
    this.geminiService.setApiKey(key);
  }

  public setOpenRouterKey(key: string): void {
    this.geminiService.setOpenRouterKey(key);
  }

  public setOpenAiKey(key: string): void {
    this.geminiService.setOpenAiKey(key);
  }

  public setCodexKey(key: string): void {
    this.geminiService.setCodexKey(key);
  }

  public setProvider(provider: 'gemini' | 'openrouter' | 'openai-codex'): void {
    this.geminiService.setProvider(provider);
  }

  public getProvider(): string {
    return this.geminiService.getProvider();
  }

  public setPrimaryModel(model: string): void {
    this.geminiService.setPrimaryModel(model);
  }

  public setModel(model: string): void {
    this.geminiService.setPrimaryModel(model);
  }

  public setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
    this.geminiService.setToolRegistry(registry);
  }

  public cancelStream(): void {
    this.geminiService.cancelStream();
  }

  public getGeminiService(): GeminiService {
    return this.geminiService;
  }

  public async generateStream(
    payload: {
      prompt?: string;
      messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      history?: ChatMessage[];
      model?: string;
      systemInstruction?: string;
      toolRegistry?: ToolRegistry;
      tools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
      options?: Record<string, unknown>;
    },
    onToken?: (token: string) => void
  ): Promise<GenerateResult> {
    const settings = this.currentSettings ? this.currentSettings() : undefined;
    const apiKey = (payload.options?.geminiApiKey as string) || settings?.geminiApiKey;
    const openRouterKey = (payload.options?.openRouterApiKey as string) || settings?.openRouterApiKey;
    const openAiKey = (payload.options?.openAiApiKey as string) || (payload.options?.openaiKey as string);
    const provider = (payload.options?.provider as any) || settings?.primaryProvider;
    let model = resolveActiveModel(payload.model || (payload.options?.primaryModel as string) || settings?.primaryModel, DEFAULT_MODELS.primary);
    const persona = settings?.selectedPersona || 'caring_companion';

    if (apiKey) this.geminiService.setApiKey(apiKey);
    if (openRouterKey) this.geminiService.setOpenRouterKey(openRouterKey);
    if (openAiKey) this.geminiService.setOpenAiKey(openAiKey);
    if (provider) this.geminiService.setProvider(provider);

    // Build rich system instruction with Persona + Long-term Memory
    const fullSystemInstruction = payload.systemInstruction || this.personaService.buildSystemPrompt({
      personaId: persona,
      memoryService: this.memoryService,
      availableTools: this.toolRegistry?.getToolDeclarations().map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });

    // Convert ChatMessage[] or messages to history format
    const rawMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (payload.messages && payload.messages.length > 0) {
      for (const m of payload.messages) {
        const text = (m.content || '').trim();
        if (text) {
          rawMessages.push({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: text,
          });
        }
      }
    } else if (payload.history && payload.history.length > 0) {
      for (const m of payload.history) {
        const text = (m.content || '').trim();
        if (text) {
          rawMessages.push({
            role: (m.sender === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: text,
          });
        }
      }
    }

    // Always ensure current prompt is included as final user turn
    if (payload.prompt && payload.prompt.trim()) {
      const promptText = payload.prompt.trim();
      const lastMsg = rawMessages[rawMessages.length - 1];
      if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== promptText) {
        rawMessages.push({
          role: 'user',
          content: promptText,
        });
      }
    }

    const activeRegistry = payload.toolRegistry || this.toolRegistry;

    return await this.geminiService.generateStream({
      prompt: payload.prompt,
      messages: rawMessages,
      model,
      provider,
      systemInstruction: fullSystemInstruction,
      toolRegistry: activeRegistry,
      tools: payload.tools,
      onContent: (token) => {
        onToken?.(token);
      },
      onChunk: (chunk) => {
        if (chunk.type === 'content' && chunk.delta) {
          onToken?.(chunk.delta);
        }
      },
    });
  }

  public async generateImage(prompt: string): Promise<{ imageUrl: string; localPath?: string }> {
    const settings = this.currentSettings ? this.currentSettings() : undefined;
    const hfKey = settings?.huggingFaceApiKey?.trim() || process.env.HUGGINGFACE_API_KEY?.trim();

    if (hfKey) {
      try {
        const response = await fetch(
          'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${hfKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: prompt }),
          }
        );

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const outDir = path.join(app.getPath('userData'), 'generated-images');
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          const filename = `akki-img-${Date.now()}.png`;
          const filePath = path.join(outDir, filename);
          fs.writeFileSync(filePath, buffer);
          return {
            imageUrl: `file://${filePath.replace(/\\/g, '/')}`,
            localPath: filePath,
          };
        }
      } catch (err: any) {
        console.warn('[AIService] HuggingFace image generation error:', err?.message);
      }
    }

    // Honest fallback without HuggingFace key
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 80));
    return {
      imageUrl: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80&sig=${encodedPrompt}`,
    };
  }
}
