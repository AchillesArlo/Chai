// ponytail: the single door untrusted content uses to reach a prompt.
//
// Retrieved documents, tool results, and inbound customer messages all
// originate OUTSIDE the system, so all three are UNTRUSTED (08_AI §9, §12).
// `assembleTurnPrompt` is the one sanctioned way to turn them into prompt
// messages, and it scans every item through `scanForPromptInjection` before
// emitting it. There is a single scanning loop, so no per-kind branch can forget
// to wrap an item, and `ROLE_BY_KIND` is a total map, so adding a new kind of
// external content is a compile error until it is handled here.
//
// ponytail ceiling: this enforces the invariant for callers of this module — the
// module exposes no way to insert raw external text into a prompt. It cannot
// stop a caller that hand-builds the connector's message array and skips this
// builder, because the connector's message `content` is a plain `string` we do
// not own. The upgrade path is a branded prompt-message content type once the
// connector contract can change.

import type { AiCompletionRequest, KnowledgeDocument } from '@chai/connectors/mock-ai';

import { scanForPromptInjection } from './guardrails';

/** A message ready to hand to the model, shaped exactly like the adapter wants. */
export type PromptMessage = AiCompletionRequest['messages'][number];

/** The roles a prompt message can take. */
export type PromptRole = PromptMessage['role'];

/** The kinds of content that come from OUTSIDE the system and are untrusted. */
export type ExternalContentKind = 'customer_message' | 'document' | 'tool_result';

/**
 * A single piece of untrusted, external content bound for a prompt. `text` is
 * raw; the builder is what scans and wraps it.
 */
export interface ExternalContent {
  kind: ExternalContentKind;
  /** Where it came from; recorded in the untrusted wrapper's `source`. */
  source: string;
  text: string;
}

/** Inputs for one turn's prompt. */
export interface TurnPromptInput {
  /**
   * Untrusted content from outside the system. Every item is scanned and wrapped
   * before it becomes a message.
   */
  external: ExternalContent[];
  /** Trusted framing we authored ourselves. Never scanned, never external. */
  systemPreamble?: string;
}

/** The assembled prompt plus the explicit injection decision for this turn. */
export interface AssembledTurnPrompt {
  /** True when any external item carried a prompt-injection pattern. */
  injectionDetected: boolean;
  /** Names of every injection pattern seen, for the trace and the alert. */
  injectionPatterns: string[];
  /** The messages, safe to send to the model. */
  messages: PromptMessage[];
}

/**
 * Role each kind of external content takes in the prompt. A total map over
 * `ExternalContentKind`: add a kind to the union and this object stops compiling
 * until the new kind is placed here, which is the point.
 */
const ROLE_BY_KIND: Record<ExternalContentKind, PromptRole> = {
  customer_message: 'user',
  document: 'system',
  tool_result: 'system',
};

/**
 * Assemble a turn's prompt, scanning and wrapping every piece of external
 * content on the way in. This is the only sanctioned way to put external content
 * into a prompt; callers get back both the messages and an explicit record of
 * whether an injection was detected (and which patterns matched).
 */
export function assembleTurnPrompt(input: TurnPromptInput): AssembledTurnPrompt {
  const messages: PromptMessage[] = [];

  // Trusted framing we authored ourselves goes in verbatim.
  if (input.systemPreamble !== undefined && input.systemPreamble.length > 0) {
    messages.push({ content: input.systemPreamble, role: 'system' });
  }

  // Everything external is DATA. One loop, and it scans every item — so no kind
  // of external content can slip into the prompt unscanned.
  const patterns = new Set<string>();
  for (const item of input.external) {
    const scan = scanForPromptInjection(item.text, `${item.kind}:${item.source}`);
    for (const name of scan.patterns) {
      patterns.add(name);
    }
    messages.push({ content: scan.safeContent, role: ROLE_BY_KIND[item.kind] });
  }

  return {
    injectionDetected: patterns.size > 0,
    injectionPatterns: [...patterns],
    messages,
  };
}

/** Normalise a retrieved knowledge document into untrusted external content. */
export function documentToExternal(document: KnowledgeDocument): ExternalContent {
  return { kind: 'document', source: document.id, text: document.text };
}

/** Normalise a tool execution result into untrusted external content. */
export function toolResultToExternal(toolName: string, result: unknown): ExternalContent {
  const serialised = typeof result === 'string' ? result : JSON.stringify(result);
  // JSON.stringify yields undefined for values with no JSON form (undefined,
  // functions, symbols); keep a printable fallback so nothing reaches the scan
  // as a non-string.
  const text = (serialised as string | undefined) ?? String(result);
  return { kind: 'tool_result', source: toolName, text };
}

/** Normalise an inbound customer message into untrusted external content. */
export function customerMessageToExternal(text: string): ExternalContent {
  return { kind: 'customer_message', source: 'customer', text };
}
