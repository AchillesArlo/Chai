import { randomUUID } from 'node:crypto';

import type {
  AiCompletionRequest,
  AiCompletionResult,
  MockAiAdapter,
} from '@chai/connectors/mock-ai';

import {
  getCostAccountingStore,
  type CostAccountingStore,
} from './cost-accounting';

export type ConversationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED';

export interface AiGatewayOptions {
  adapter: MockAiAdapter;
  aliases?: Record<string, string>;
  blockedTools?: string[];
  /**
   * Per-tenant monthly spend cap in USD. Once reached, generation stops rather
   * than continuing to bill (08_AI §20).
   */
  monthlyBudgetUsd?: number;
  /**
   * Cheaper model to fall back to when the budget is exhausted. Absent means
   * there is no safe fallback, so the turn hands over to a human instead.
   */
  safeFallbackModel?: string;
  costStore?: CostAccountingStore;
}

// Re-export all gateway components
export * from './rag';
export * from './guardrails';
export * from './cost-accounting';
export * from './conversation-state';
export * from './tool-execution';
export * from './prompt-context';

/**
 * Create an AI gateway that wraps an adapter with alias resolution,
 * tool proposal filtering, and budget enforcement.
 */
export function createAiGateway(options: AiGatewayOptions) {
  const {
    adapter,
    aliases = {},
    blockedTools = [],
    monthlyBudgetUsd,
    safeFallbackModel,
    costStore = getCostAccountingStore(),
  } = options;

  function resolveModel(requested: string): string {
    return aliases[requested] ?? requested;
  }

  function isToolAllowed(name: string): boolean {
    return !blockedTools.includes(name);
  }

  return {
    async complete(
      request: AiCompletionRequest & { tenantId?: string },
    ): Promise<AiCompletionResult & { budgetExhausted?: boolean }> {
      let resolvedModel = resolveModel(request.model);

      // Budget is enforced BEFORE the call, not reconciled after it. An
      // exhausted tenant either drops to a cheaper model or hands over; it never
      // keeps spending (08_AI §20).
      const overBudget =
        monthlyBudgetUsd !== undefined &&
        request.tenantId !== undefined &&
        costStore.hasExceededBudget(request.tenantId, monthlyBudgetUsd);

      if (overBudget) {
        if (!safeFallbackModel) {
          // No cheaper model to drop to: return an explicit safe fallback so the
          // caller hands the turn to a human instead of spending further.
          return {
            budgetExhausted: true,
            citations: [],
            content: '',
            model: resolvedModel,
            safeFallback: true,
            toolProposals: [],
            traceId: randomUUID(),
          };
        }
        resolvedModel = resolveModel(safeFallbackModel);
      }

      const result = await adapter.complete({
        ...request,
        model: resolvedModel,
      });

      // Filter tool proposals against blocklist
      const allowedToolProposals = result.toolProposals.filter((p) =>
        isToolAllowed(p.tool)
      );

      return {
        ...result,
        ...(overBudget ? { budgetExhausted: true } : {}),
        model: resolvedModel,
        safeFallback: result.safeFallback || overBudget,
        toolProposals: allowedToolProposals,
      };
    },
  };
}

export type AiGateway = ReturnType<typeof createAiGateway>;
