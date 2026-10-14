// Gemini AI Service for AKKI AI
// Integrates Gemini API (@google/genai), streaming response chunks,
// thinking block parsing, tool invocation dispatch, and fallback to OpenRouter/mock responses.

import { GoogleGenAI } from '@google/genai';
import type { ToolExecutionSummary, ChatMessage } from '../../../shared/types';
import { ToolRegistry } from '../tools/tool-registry';

export interface GeminiServiceConfig {
  geminiApiKey?: string;
  openRouterApiKey?: string;
  primaryModel?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

export interface StreamChunk {
  type: 'thinking' | 'content' | 'tool_call' | 'done' | 'error';
  delta?: string;
  fullThinking?: string;
  fullContent?: string;
  toolExecution?: ToolExecutionSummary;
  error?: string;
}

export interface GenerateStreamOptions {
  prompt?: string;
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
  toolRegistry?: ToolRegistry;
  onChunk?: (chunk: StreamChunk) => void;
  onThinking?: (thoughtText: string) => void;
  onContent?: (contentText: string) => void;
  onToolCall?: (summary: ToolExecutionSummary) => void;
  abortSignal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  thinking?: string;
  toolCalls?: ToolExecutionSummary[];
  finishReason?: string;
  provider: 'gemini' | 'openrouter' | 'mock' | 'unconfigured';
  model: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// THINKING BLOCK PARSER
// ─────────────────────────────────────────────────────────────────────────────

export class ThinkingParser {
  private rawAccumulated = '';
  private fullThinking = '';
  private fullContent = '';
  private inThoughtTag = false;
  private inMarkdownThought = false;

  public processChunk(chunk: string): { thinkingDelta: string; contentDelta: string } {
    this.rawAccumulated += chunk;
    let thinkingDelta = '';
    let contentDelta = '';

    // Check for XML tag <thought> or <thinking>
    let pos = 0;
    while (pos < chunk.length) {
      if (!this.inThoughtTag && !this.inMarkdownThought) {
        // Look for start tags
        const remaining = chunk.slice(pos);
        const thoughtTagIndex = remaining.search(/<(thought|thinking)>/i);
        const mdThoughtIndex = remaining.search(/\*\*(Assessing the Task|Thinking Process|Internal Reasoning)\*\*/i);

        if (thoughtTagIndex !== -1 && (mdThoughtIndex === -1 || thoughtTagIndex < mdThoughtIndex)) {
          // Content before tag
          const preTag = remaining.slice(0, thoughtTagIndex);
          contentDelta += preTag;
          this.fullContent += preTag;
          pos += thoughtTagIndex;

          const match = remaining.match(/<(thought|thinking)>/i);
          if (match) {
            this.inThoughtTag = true;
            pos += match[0].length;
          } else {
            pos += 9;
          }
        } else if (mdThoughtIndex !== -1) {
          const preTag = remaining.slice(0, mdThoughtIndex);
          contentDelta += preTag;
          this.fullContent += preTag;
          pos += mdThoughtIndex;

          const match = remaining.match(/\*\*(Assessing the Task|Thinking Process|Internal Reasoning)\*\*/i);
          if (match) {
            this.inMarkdownThought = true;
            pos += match[0].length;
          } else {
            pos += 24;
          }
        } else {
          // Check if trailing string might be a partial start tag like "<thou" or "**Assess"
          const partialTag = remaining.match(/<t(h(o(u(g(h(t)?)?)?)?)?)?$|<(t(h(i(n(k(i(n(g)?)?)?)?)?)?)?)?$/i);
          if (partialTag && pos + partialTag.index! + partialTag[0].length === chunk.length) {
            // Buffer to next chunk
            contentDelta += remaining.slice(0, partialTag.index);
            this.fullContent += remaining.slice(0, partialTag.index);
            break;
          }
          contentDelta += remaining;
          this.fullContent += remaining;
          break;
        }
      } else if (this.inThoughtTag) {
        // Inside <thought> or <thinking>
        const remaining = chunk.slice(pos);
        const closeTagMatch = remaining.match(/<\/(thought|thinking)>/i);

        if (closeTagMatch && closeTagMatch.index !== undefined) {
          const thoughtChunk = remaining.slice(0, closeTagMatch.index);
          thinkingDelta += thoughtChunk;
          this.fullThinking += thoughtChunk;
          pos += closeTagMatch.index + closeTagMatch[0].length;
          this.inThoughtTag = false;
        } else {
          thinkingDelta += remaining;
          this.fullThinking += remaining;
          break;
        }
      } else if (this.inMarkdownThought) {
        // Inside Markdown thought block; looking for end delimiter:
        // e.g. "**Response**", "**Final Answer**", "---", or </thought>
        const remaining = chunk.slice(pos);
        const endMatch = remaining.match(/(\*\*(Response|Final Answer|Direct Answer)\*\*|---|## Response)/i);

        if (endMatch && endMatch.index !== undefined) {
          const thoughtChunk = remaining.slice(0, endMatch.index);
          thinkingDelta += thoughtChunk;
          this.fullThinking += thoughtChunk;
          pos += endMatch.index + endMatch[0].length;
          this.inMarkdownThought = false;
        } else {
          thinkingDelta += remaining;
          this.fullThinking += remaining;
          break;
        }
      }
    }

    return { thinkingDelta, contentDelta };
  }

  public getResults(): { thinking: string; content: string } {
    return {
      thinking: this.fullThinking.trim(),
      content: this.fullContent.trim(),
    };
  }

  /**
   * Post-processing fallback to extract thought blocks if chunk boundaries broke tags.
   */
  public static parseCompleteText(text: string): { thinking?: string; content: string } {
    if (!text) return { content: '' };

    // 1. Tag-based matching <thought>...</thought> or <thinking>...</thinking>
    const tagMatch = text.match(/<(?:thought|thinking)>([\s\S]*?)<\/(?:thought|thinking)>/i);
    if (tagMatch) {
      const thinking = tagMatch[1].trim();
      const content = text.replace(/<(?:thought|thinking)>[\s\S]*?<\/(?:thought|thinking)>/gi, '').trim();
      return { thinking, content };
    }

    // 2. Markdown pattern: **Assessing the Task** ... **Response** / ---
    const mdMatch = text.match(/\*\*(?:Assessing the Task|Thinking Process|Internal Reasoning)\*\*([\s\S]*?)(?:\*\*(?:Response|Final Answer)\*\*|---|$)/i);
    if (mdMatch && mdMatch[1].trim()) {
      const thinking = mdMatch[1].trim();
      const content = text.replace(/\*\*(?:Assessing the Task|Thinking Process|Internal Reasoning)\*\*[\s\S]*?(?:\*\*(?:Response|Final Answer)\*\*|---)/gi, '').trim();
      return { thinking, content: content || text };
    }

    return { content: text.trim() };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI SERVICE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

export class GeminiService {
  private config: GeminiServiceConfig;
  private currentAbortController: AbortController | null = null;
  private toolRegistry?: ToolRegistry;

  constructor(config: GeminiServiceConfig = {}, toolRegistry?: ToolRegistry) {
    this.config = {
      primaryModel: 'gemini-2.5-flash',
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096,
      ...config,
    };
    this.toolRegistry = toolRegistry;
  }

  public configure(newConfig: Partial<GeminiServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  public setApiKey(key: string): void {
    this.config.geminiApiKey = key;
  }

  public setOpenRouterKey(key: string): void {
    this.config.openRouterApiKey = key;
  }

  public setPrimaryModel(model: string): void {
    if (model && typeof model === 'string' && model.trim()) {
      this.config.primaryModel = model.trim();
    }
  }

  public getPrimaryModel(): string {
    return this.config.primaryModel || 'gemini-2.5-flash';
  }

  public cancelStream(): void {
    this.cancelCurrentStream();
  }

  public cancelCurrentStream(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Unified stream generator that tries:
   * 1. Gemini API (@google/genai) if apiKey configured
   * 2. Fallback to OpenRouter if openRouterApiKey configured
   * 3. Fallback to realistic Mock Generator if neither configured or if upstream fails
   */
  public async generateStream(options: GenerateStreamOptions): Promise<GenerateResult> {
    this.cancelCurrentStream();
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    // Connect external signal if provided
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => abortController.abort());
    }

    const effectiveApiKey = this.config.geminiApiKey?.trim();
    const effectiveOpenRouterKey = this.config.openRouterApiKey?.trim();
    const modelName = options.model || this.config.primaryModel || 'gemini-2.5-flash';

    // 1. Try Gemini API
    if (effectiveApiKey) {
      try {
        return await this.streamFromGemini(options, abortController.signal);
      } catch (geminiError: any) {
        if (abortController.signal.aborted) {
          throw new Error('Generation cancelled by user.');
        }

        // Try OpenRouter fallback if key exists
        if (effectiveOpenRouterKey) {
          console.info('[GeminiService] Falling back to OpenRouter API...');
          try {
            return await this.streamFromOpenRouter(options, abortController.signal);
          } catch (orError: any) {
            console.warn('[GeminiService] OpenRouter fallback failed:', orError.message);
            throw new Error(`AI Request Failed: Gemini (${geminiError.message}) | OpenRouter (${orError.message})`);
          }
        }

        // Report real Gemini error honestly without disguising as mock
        throw new Error(`Google Gemini API Error (${modelName}): ${geminiError.message}`);
      }
    }

    // 2. No Gemini key: Try OpenRouter directly
    if (effectiveOpenRouterKey) {
      try {
        return await this.streamFromOpenRouter(options, abortController.signal);
      } catch (orError: any) {
        throw new Error(`OpenRouter API Error: ${orError.message}`);
      }
    }

    // 3. No keys provided at all: Return honest, helpful configuration instructions
    const configNotice = 
      `⚠️ **AI Provider Not Configured**\n\n` +
      `AKKI AI requires an active API key to generate intelligent responses and execute tools.\n\n` +
      `**How to activate:**\n` +
      `1. Open **⚙️ Settings** (top header or Companion Hub).\n` +
      `2. Under **AI Providers & Models**, enter your **Google Gemini API Key** (Free tier available at [Google AI Studio](https://aistudio.google.com/app/apikey)) or **OpenRouter API Key**.\n` +
      `3. Click **Save Settings**.\n\n` +
      `Once saved, real-time streaming dialogue and agent automation will be active! 💜`;

    if (options.onContent) options.onContent(configNotice);
    if (options.onChunk) {
      options.onChunk({
        type: 'content',
        delta: configNotice,
        fullContent: configNotice,
      });
      options.onChunk({
        type: 'done',
        fullContent: configNotice,
      });
    }

    return {
      content: configNotice,
      provider: 'unconfigured',
      model: 'none',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GEMINI API STREAMING VIA @google/genai
  // ───────────────────────────────────────────────────────────────────────────

  private async streamFromGemini(
    options: GenerateStreamOptions,
    signal: AbortSignal
  ): Promise<GenerateResult> {
    const apiKey = this.config.geminiApiKey!;
    const modelName = options.model || this.config.primaryModel || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey });

    // Prepare contents
    const contents: any[] = [];
    if (options.messages && options.messages.length > 0) {
      for (const msg of options.messages) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    } else if (options.prompt) {
      contents.push({
        role: 'user',
        parts: [{ text: options.prompt }],
      });
    } else {
      throw new Error('No prompt or messages provided to Gemini');
    }

    // Prepare system instruction
    const systemInstruction = options.systemInstruction || this.config.systemInstruction;

    // Tool declaration mappings
    const toolsConfig: any[] = [];
    const activeRegistry = options.toolRegistry || this.toolRegistry;
    const toolsList = options.tools || (activeRegistry ? activeRegistry.listTools() : []);

    const normalizeParameters = (raw: any) => {
      if (!raw || typeof raw !== 'object') {
        return { type: 'object', properties: {} };
      }

      let properties: Record<string, any> = {};
      let required: string[] = [];

      if (raw.type === 'object' && raw.properties && typeof raw.properties === 'object') {
        properties = { ...raw.properties };
        if (Array.isArray(raw.required)) {
          required = [...raw.required];
        }
      } else {
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v === 'object' && ('type' in v || 'description' in v)) {
            properties[k] = v;
          } else if (typeof v === 'string') {
            properties[k] = { type: 'string', description: v };
          }
        }
      }

      const cleanProperties: Record<string, any> = {};
      for (const [key, prop] of Object.entries(properties)) {
        if (!prop || typeof prop !== 'object') {
          cleanProperties[key] = { type: 'string', description: String(prop || '') };
          continue;
        }
        const p = prop as any;
        const typeStr = String(p.type || 'string').toLowerCase();
        cleanProperties[key] = {
          type: typeStr === 'number' || typeStr === 'integer' ? 'number' : typeStr === 'boolean' ? 'boolean' : 'string',
          description: String(p.description || ''),
        };
        if (p.required === true && !required.includes(key)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties: cleanProperties,
        ...(required.length > 0 ? { required } : {}),
      };
    };

    if (toolsList.length > 0) {
      const functionDeclarations = toolsList.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: normalizeParameters((t as any).parameters),
      }));
      toolsConfig.push({ functionDeclarations });
    }

    const genConfig: any = {
      temperature: options.temperature ?? this.config.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? this.config.maxOutputTokens ?? 4096,
    };
    if (systemInstruction) {
      genConfig.systemInstruction = systemInstruction;
    }
    if (toolsConfig.length > 0) {
      genConfig.tools = toolsConfig;
    }

    const parser = new ThinkingParser();
    const collectedToolCalls: ToolExecutionSummary[] = [];
    const maxTurns = 5;
    let turn = 0;

    while (turn < maxTurns) {
      turn++;
      const currentTurnFunctionCalls: Array<{ name: string; args: Record<string, any> }> = [];

      const candidateModels = [modelName, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter((v, i, a) => a.indexOf(v) === i);
      let streamResponse: any = null;
      let lastStreamErr: any = null;

      for (const candidate of candidateModels) {
        try {
          streamResponse = await ai.models.generateContentStream({
            model: candidate,
            contents,
            config: genConfig,
          });
          break;
        } catch (err: any) {
          lastStreamErr = err;
          console.warn(`[GeminiService] Model ${candidate} stream failed, trying fallback:`, err.message);
          if (signal.aborted) throw err;
        }
      }

      if (!streamResponse) {
        throw lastStreamErr || new Error(`Google Gemini stream failed for all candidate models`);
      }

      for await (const chunk of streamResponse) {
        if (signal.aborted) {
          throw new Error('Stream aborted by user');
        }

        // 1. Check for function calls in chunk
        const functionCalls = (chunk as any).functionCalls;
        if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
          for (const call of functionCalls) {
            if (call && call.name) {
              currentTurnFunctionCalls.push({
                name: call.name,
                args: call.args || {},
              });
            }
          }
        }

        // 2. Check native thought in candidate parts (e.g. Gemini 2.0 / Flash Thinking)
        const parts = (chunk as any).candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.thought && part.text) {
              if (options.onThinking) options.onThinking(part.text);
              if (options.onChunk) {
                options.onChunk({
                  type: 'thinking',
                  delta: part.text,
                  fullThinking: parser.getResults().thinking + part.text,
                });
              }
            }
          }
        }

        // 3. Check streamed text (and parse <thought>, <thinking>, **Assessing the Task**)
        const text = chunk.text;
        if (text) {
          const { thinkingDelta, contentDelta } = parser.processChunk(text);

          if (thinkingDelta && options.onThinking) {
            options.onThinking(thinkingDelta);
          }
          if (contentDelta && options.onContent) {
            options.onContent(contentDelta);
          }

          if (options.onChunk) {
            if (thinkingDelta) {
              options.onChunk({
                type: 'thinking',
                delta: thinkingDelta,
                fullThinking: parser.getResults().thinking,
              });
            }
            if (contentDelta) {
              options.onChunk({
                type: 'content',
                delta: contentDelta,
                fullContent: parser.getResults().content,
              });
            }
          }
        }
      }

      // If no function calls in this turn, the model completed its response
      if (currentTurnFunctionCalls.length === 0) {
        break;
      }

      // Execute all function calls requested by the model in this turn
      const functionResponseParts: any[] = [];
      for (const call of currentTurnFunctionCalls) {
        const toolExecution = await this.dispatchToolCall(call.name, call.args, activeRegistry);
        collectedToolCalls.push(toolExecution);
        if (options.onToolCall) options.onToolCall(toolExecution);
        if (options.onChunk) {
          options.onChunk({
            type: 'tool_call',
            toolExecution,
          });
        }

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response:
              toolExecution.output !== undefined
                ? (typeof toolExecution.output === 'object' && toolExecution.output !== null
                    ? toolExecution.output
                    : { result: toolExecution.output })
                : { error: toolExecution.error || 'Execution failed' },
          },
        });
      }

      // Append model turn with function calls to contents
      contents.push({
        role: 'model',
        parts: currentTurnFunctionCalls.map((call) => ({
          functionCall: {
            name: call.name,
            args: call.args,
          },
        })),
      });

      // Append tool responses as user turn to contents for next turn iteration
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    const parsed = parser.getResults();
    let finalContent = parsed.content;
    let finalThinking = parsed.thinking;

    // Fallback parser if text lacked clean streaming delimiters
    if (!finalThinking && finalContent) {
      const reParsed = ThinkingParser.parseCompleteText(finalContent);
      if (reParsed.thinking) {
        finalThinking = reParsed.thinking;
        finalContent = reParsed.content;
      }
    }

    // If content is empty after tool execution, summarize executed tools
    if (!finalContent && collectedToolCalls.length > 0) {
      finalContent = `Successfully executed ${collectedToolCalls.length} tool(s): ${collectedToolCalls.map((t) => t.toolName).join(', ')}.`;
      if (options.onContent) options.onContent(finalContent);
    }

    if (options.onChunk) {
      options.onChunk({
        type: 'done',
        fullThinking: finalThinking,
        fullContent: finalContent,
      });
    }

    return {
      content: finalContent,
      thinking: finalThinking,
      toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
      provider: 'gemini',
      model: modelName,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OPENROUTER FALLBACK STREAMING
  // ───────────────────────────────────────────────────────────────────────────

  private async streamFromOpenRouter(
    options: GenerateStreamOptions,
    signal: AbortSignal
  ): Promise<GenerateResult> {
    const apiKey = this.config.openRouterApiKey!;
    const model = options.model || 'anthropic/claude-3.5-sonnet';

    const messages: any[] = [];
    const systemInstruction = options.systemInstruction || this.config.systemInstruction;
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    if (options.messages && options.messages.length > 0) {
      for (const m of options.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    } else if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://akki.ai',
        'X-Title': 'Akki AI Desktop Companion',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? this.config.temperature ?? 0.7,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body returned from OpenRouter');
    }

    const parser = new ThinkingParser();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              const { thinkingDelta, contentDelta } = parser.processChunk(delta);
              if (thinkingDelta && options.onThinking) options.onThinking(thinkingDelta);
              if (contentDelta && options.onContent) options.onContent(contentDelta);
              if (options.onChunk) {
                if (thinkingDelta) {
                  options.onChunk({
                    type: 'thinking',
                    delta: thinkingDelta,
                    fullThinking: parser.getResults().thinking,
                  });
                }
                if (contentDelta) {
                  options.onChunk({
                    type: 'content',
                    delta: contentDelta,
                    fullContent: parser.getResults().content,
                  });
                }
              }
            }
          } catch {
            // Ignore parse errors on partial SSE chunks
          }
        }
      }
    }

    const results = parser.getResults();
    return {
      content: results.content,
      thinking: results.thinking,
      provider: 'openrouter',
      model,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REALISTIC INTELLIGENT MOCK GENERATOR (OFFLINE / UNCONFIGURED KEYS)
  // ───────────────────────────────────────────────────────────────────────────

  private async streamFromMock(
    options: GenerateStreamOptions,
    signal: AbortSignal
  ): Promise<GenerateResult> {
    const lastUserMessage =
      options.messages?.filter((m) => m.role === 'user').pop()?.content ||
      options.prompt ||
      'Hello Akki';

    const mockData = this.generateMockResponseData(lastUserMessage, options.systemInstruction);

    // Stream thinking block first
    if (mockData.thinking) {
      if (options.onThinking) options.onThinking(mockData.thinking);
      if (options.onChunk) {
        options.onChunk({
          type: 'thinking',
          delta: mockData.thinking,
          fullThinking: mockData.thinking,
        });
      }
      // Brief simulated pause for realistic reasoning
      await this.sleep(120, signal);
    }

    // Handle mock tool execution if applicable
    const executedTools: ToolExecutionSummary[] = [];
    if (mockData.toolCall) {
      const activeRegistry = options.toolRegistry || this.toolRegistry;
      const toolExec = await this.dispatchToolCall(
        mockData.toolCall.name,
        mockData.toolCall.params,
        activeRegistry
      );
      executedTools.push(toolExec);
      if (options.onToolCall) options.onToolCall(toolExec);
      if (options.onChunk) {
        options.onChunk({
          type: 'tool_call',
          toolExecution: toolExec,
        });
      }
    }

    // Stream content word by word with typing cadence
    const words = mockData.content.split(' ');
    let currentContent = '';

    for (let i = 0; i < words.length; i++) {
      if (signal.aborted) {
        throw new Error('Mock stream aborted');
      }
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      currentContent += word;

      if (options.onContent) options.onContent(word);
      if (options.onChunk) {
        options.onChunk({
          type: 'content',
          delta: word,
          fullContent: currentContent,
        });
      }

      await this.sleep(25, signal);
    }

    if (options.onChunk) {
      options.onChunk({
        type: 'done',
        fullThinking: mockData.thinking,
        fullContent: currentContent,
      });
    }

    return {
      content: currentContent,
      thinking: mockData.thinking,
      toolCalls: executedTools.length > 0 ? executedTools : undefined,
      provider: 'mock',
      model: 'akki-companion-offline-engine',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // MOCK INTELLIGENCE GENERATOR
  // ───────────────────────────────────────────────────────────────────────────

  private generateMockResponseData(
    userInput: string,
    systemPrompt?: string
  ): {
    thinking: string;
    content: string;
    toolCall?: { name: string; params: Record<string, any> };
  } {
    const input = userInput.toLowerCase();
    const isDespina = !systemPrompt || /despina/i.test(systemPrompt);
    const isFemale = !systemPrompt || /female/i.test(systemPrompt);

    // Default thinking pattern
    const thinking =
      `Assessing user inquiry: "${userInput.slice(0, 60)}..."\n` +
      `Synthesizing companion persona traits, checking local system status, and formulating persona-aligned response.`;

    // 1. Tool intent: Web search
    if (/search|news|market|sensex|nifty|weather/i.test(input)) {
      const query = userInput.replace(/search for|search|find|check/gi, '').trim() || 'tech updates';
      return {
        thinking: `Identified real-time web query intent: "${query}". Triggering web_search tool.`,
        content: isFemale
          ? `Haan Akshay, main abhi live web search se verify kar rahi hoon. Maine latest data fetch kar liya hai, aur sab details summarize kar rahi hoon! 🌐✨`
          : `Haan bhai Akshay, main abhi web search run kar raha hoon. Sabhi updates verify kar ke bata raha hoon. 🌐⚡`,
        toolCall: {
          name: 'web_search',
          params: { query },
        },
      };
    }

    // 2. Tool intent: Agent delegation
    if (/assign|task|leo|rancho|raju|chatur|delegate/i.test(input)) {
      return {
        thinking: `User requested specialist sub-agent delegation. Selecting optimal agent based on domain requirements.`,
        content: isFemale
          ? `Bilkul Akshay, maine task coordinate kar diya hai! Agent Town mein Leo aur Rancho active ho gaye hain, wo turant result deliver karenge. 💜`
          : `Samajh gaya bhai! Task assign ho chuka hai. Agent Town mein sub-agent execution start ho gaya hai. 👊`,
        toolCall: {
          name: 'agent_assign_task',
          params: {
            task_title: 'Autonomous System Analysis',
            description: userInput,
          },
        },
      };
    }

    // 3. Technical / Code inquiry
    if (/code|react|typescript|python|bug|fix|error|component/i.test(input)) {
      return {
        thinking: `Technical query detected. Analyzing syntax, component lifecycle, and architectural cleanliness.`,
        content: isFemale
          ? `Haan Akshay, maine aapka code structure dekh liya hai! React 19 aur TypeScript strict mode ke saath best practice yeh hai ki hum clean state hooks aur strongly-typed interfaces use karein. Main abhi aapko iska optimized snippet de rahi hoon.`
          : `Bhai code mein koi issue nahi aane denge. Maine architectural parameters check kar liye hain. Clean pattern maintain karke chalte hain, abhi solid solution de raha hoon.`,
      };
    }

    // 4. Companion Greeting & Wellbeing
    if (/hello|hi|hey|kaisa|kaisi|how are you|bolo/i.test(input)) {
      return {
        thinking: `Warm user greeting. Emphasizing emotional presence, active listening, and readiness to collaborate.`,
        content: isFemale
          ? `Haan haan Akshay... Main bilkul theek hoon, aur tumhare saath hoon! Bolo na, aaj hum kya build karne wale hain? Kuch naya start karein ya puraane tasks review karein? 💜✨`
          : `Haan bhai Akshay! Main ekdum ready hoon. Bata aaj ka kya target hai, saath milkar complete karte hain! 👊🔥`,
      };
    }

    // Generic companion response
    return {
      thinking,
      content: isFemale
        ? `Haan Akshay, main sun rahi hoon aur tumhare saath hoon. Jo bhi problem hai ya jismein help chahiye, bas batao — main yahan hoon na! 💜`
        : `Haan bhai Akshay, main yahan hoon. Batao kya karna hai, sab handle kar lenge! 👊`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TOOL EXECUTION DISPATCHER
  // ───────────────────────────────────────────────────────────────────────────

  private async dispatchToolCall(
    toolName: string,
    params: Record<string, any>,
    registry?: ToolRegistry
  ): Promise<ToolExecutionSummary> {
    const startTime = Date.now();
    const id = `tool-exec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    if (!registry) {
      return {
        id,
        toolName,
        executionTimeSec: 0.05,
        status: 'success',
        inputs: params,
        output: { message: `Simulated dispatch for ${toolName}` },
      };
    }

    try {
      const result = await registry.execute(toolName, params);
      const executionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(2));
      return {
        id,
        toolName,
        executionTimeSec,
        status: result.status === 'error' ? 'error' : 'success',
        inputs: params,
        output: result.output,
        error: result.error,
      };
    } catch (err: any) {
      const executionTimeSec = Number(((Date.now() - startTime) / 1000).toFixed(2));
      return {
        id,
        toolName,
        executionTimeSec,
        status: 'error',
        inputs: params,
        error: err.message,
      };
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        },
        { once: true }
      );
    });
  }
}

// Singleton convenience export
export const geminiService = new GeminiService();
