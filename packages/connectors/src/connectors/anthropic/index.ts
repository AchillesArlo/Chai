import { randomUUID } from 'node:crypto';

import type {
  AiCompletionRequest,
  AiCompletionResult,
} from '../mock-ai/index.js';

// ponytail: real Anthropic Claude adapter. Uses native fetch; streaming via ReadableStream.
// Falls back to a deterministic echo when apiKey is absent (dev/CI).

/**
 * Anthropic adapter configuration.
 */
export interface AnthropicAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  anthropicVersion?: string;
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_VERSION = '2023-06-01';

/**
 * Cost per 1M tokens (in USD).
 */
const COST_PER_1M_TOKENS: Record<string, { completion: number; prompt: number }> = {
  'claude-3-5-sonnet-20241022': { completion: 15, prompt: 3 },
  'claude-3-5-haiku-20241022': { completion: 1.25, prompt: 0.8 },
  'claude-3-opus-20240229': { completion: 75, prompt: 15 },
};

/**
 * Create a real Anthropic Claude LLM adapter.
 */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}) {
  const apiKey = options.apiKey;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  const version = options.anthropicVersion ?? DEFAULT_VERSION;
  const isProduction = Boolean(apiKey);

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const rates = COST_PER_1M_TOKENS[model] ?? { completion: 10, prompt: 3 };
    const promptCost = (promptTokens / 1_000_000) * rates.prompt;
    const completionCost = (completionTokens / 1_000_000) * rates.completion;
    return Math.round((promptCost + completionCost) * 1_000_000) / 1_000_000;
  }

  /**
   * Split messages: Anthropic uses separate system prompt + user/assistant turns.
   */
  function splitMessages(messages: AiCompletionRequest['messages']): {
    systemPrompt: string;
    turns: Array<{ content: string; role: 'user' | 'assistant' }>;
  } {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ content: m.content, role: m.role as 'user' | 'assistant' }));

    return {
      systemPrompt: systemParts.join('\n'),
      turns,
    };
  }

  return {
    isProduction,

    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
      const model = request.model || defaultModel;

      // Dry-run fallback for dev/CI without API key
      if (!apiKey) {
        const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
        const content = lastUser
          ? `[anthropic:${model}] ${lastUser.content}`
          : `[anthropic:${model}] ready`;
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

      const { systemPrompt, turns } = splitMessages(request.messages);

      const response = await fetch(`${baseUrl}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: 1024,
          messages: turns,
          model,
          stream: false,
          system: systemPrompt,
        }),
        headers: {
          'anthropic-version': version,
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        content: Array<{ text: string; type: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      const content = data.content?.map((c) => c.text).join('') ?? '';
      const promptTokens = data.usage?.input_tokens ?? 0;
      const completionTokens = data.usage?.output_tokens ?? estimateTokens(content);

      return {
        citations: [],
        content,
        model,
        safeFallback: false,
        toolProposals: [],
        traceId: randomUUID(),
        usage: {
          completionTokens,
          costUsd: calculateCost(model, promptTokens, completionTokens),
          promptTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },

    /**
     * Stream completion via async generator.
     */
    async *stream(request: AiCompletionRequest): AsyncGenerator<string> {
      const model = request.model || defaultModel;

      if (!apiKey) {
        const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
        const content = lastUser ? `[anthropic:${model}] ${lastUser.content}` : '';
        const chunks = content.split(' ');
        for (const chunk of chunks) {
          yield chunk + ' ';
        }
        return;
      }

      const { systemPrompt, turns } = splitMessages(request.messages);

      const response = await fetch(`${baseUrl}/v1/messages`, {
        body: JSON.stringify({
          max_tokens: 1024,
          messages: turns,
          model,
          stream: true,
          system: systemPrompt,
        }),
        headers: {
          'anthropic-version': version,
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        method: 'POST',
      });

      if (!response.ok || !response.body) {
        throw new Error(`Anthropic stream error: ${response.status}`);
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
            try {
              const json = JSON.parse(payload) as {
                type: string;
                delta?: { text?: string };
              };
              if (json.type === 'content_block_delta' && json.delta?.text) {
                yield json.delta.text;
              }
            } catch {
              // skip malformed chunk
            }
          }
        }
      }
    },
  };
}

export type AnthropicAdapter = ReturnType<typeof createAnthropicAdapter>;
