import { randomUUID } from 'node:crypto';

import type {
  AiCompletionRequest,
  AiCompletionResult,
} from '../mock-ai/index.js';

// ponytail: real OpenAI adapter. Uses native fetch; streaming via ReadableStream.
// Falls back to a deterministic echo when apiKey is absent (dev/CI).

/**
 * OpenAI adapter configuration.
 */
export interface OpenAiAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  organization?: string;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI message format.
 */
interface OpenAiMessage {
  content: string;
  role: 'system' | 'user' | 'assistant';
}

/**
 * Token usage from OpenAI response.
 */
export interface OpenAiTokenUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

/**
 * Cost per 1M tokens (in USD). Adjusted via env or config.
 */
const COST_PER_1M_TOKENS: Record<string, { completion: number; prompt: number }> = {
  'gpt-4o': { completion: 15, prompt: 5 },
  'gpt-4o-mini': { completion: 0.6, prompt: 0.15 },
  'gpt-4-turbo': { completion: 30, prompt: 10 },
  'gpt-3.5-turbo': { completion: 1.5, prompt: 0.5 },
};

/**
 * Create a real OpenAI LLM adapter.
 */
export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}) {
  const apiKey = options.apiKey;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = options.defaultModel ?? 'gpt-4o-mini';
  const isProduction = Boolean(apiKey);

  /**
   * Map internal messages to OpenAI format.
   */
  function mapMessages(messages: AiCompletionRequest['messages']): OpenAiMessage[] {
    return messages.map((m) => ({
      content: m.content,
      role: m.role,
    }));
  }

  /**
   * Estimate token count (rough: 1 token ≈ 4 chars).
   */
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost in USD.
   */
  function calculateCost(model: string, usage: OpenAiTokenUsage): number {
    const rates = COST_PER_1M_TOKENS[model] ?? { completion: 1, prompt: 0.5 };
    const promptCost = (usage.promptTokens / 1_000_000) * rates.prompt;
    const completionCost = (usage.completionTokens / 1_000_000) * rates.completion;
    return Math.round((promptCost + completionCost) * 1_000_000) / 1_000_000;
  }

  return {
    isProduction,

    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
      const model = request.model || defaultModel;

      // Dry-run fallback for dev/CI without API key
      if (!isProduction) {
        const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
        const content = lastUser
          ? `[openai:${model}] ${lastUser.content}`
          : `[openai:${model}] ready`;
        const promptTokens = estimateTokens(
          request.messages.map((m) => m.content).join('')
        );
        return {
          citations: [],
          content,
          model,
          safeFallback: false,
          toolProposals: [],
          traceId: randomUUID(),
          usage: {
            completionTokens: estimateTokens(content),
            costUsd: 0,
            promptTokens,
            totalTokens: promptTokens + estimateTokens(content),
          },
        };
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: 1024,
          messages: mapMessages(request.messages),
          model,
          stream: false,
          temperature: 0.7,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(options.organization ? { 'OpenAI-Organization': options.organization } : {}),
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { completion_tokens: number; prompt_tokens: number; total_tokens: number };
      };

      const content = data.choices[0]?.message?.content ?? '';
      const usage: OpenAiTokenUsage = {
        completionTokens: data.usage?.completion_tokens ?? estimateTokens(content),
        promptTokens: data.usage?.prompt_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return {
        citations: [],
        content,
        model,
        safeFallback: false,
        toolProposals: [],
        traceId: randomUUID(),
        usage: {
          ...usage,
          costUsd: calculateCost(model, usage),
        },
      };
    },

    /**
     * Stream completion via async generator.
     */
    async *stream(request: AiCompletionRequest): AsyncGenerator<string> {
      const model = request.model || defaultModel;

      if (!isProduction) {
        // Dry-run: yield content in chunks
        const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
        const content = lastUser ? `[openai:${model}] ${lastUser.content}` : '';
        const chunks = content.split(' ');
        for (const chunk of chunks) {
          yield chunk + ' ';
        }
        return;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: 1024,
          messages: mapMessages(request.messages),
          model,
          stream: true,
          temperature: 0.7,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok || !response.body) {
        throw new Error(`OpenAI stream error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') return;
            try {
              const json = JSON.parse(payload) as {
                choices: Array<{ delta: { content?: string } }>;
              };
              const delta = json.choices[0]?.delta?.content;
              if (delta) yield delta;
            } catch {
              // skip malformed chunk
            }
          }
        }
      }
    },
  };
}

export type OpenAiAdapter = ReturnType<typeof createOpenAiAdapter>;
