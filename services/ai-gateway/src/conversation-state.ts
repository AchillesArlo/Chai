// ponytail: conversation mode state machine — AI_ACTIVE ↔ HUMAN_ACTIVE ↔ PAUSED.

/**
 * Conversation modes.
 */
export type ConversationMode = 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'PAUSED';

/**
 * State machine events that trigger transitions.
 */
export type ConversationEvent =
  | 'ESCALATE' // AI → HUMAN
  | 'HUMAN_TAKEOVER' // PAUSED → HUMAN
  | 'PAUSE' // any → PAUSED
  | 'RESUME' // PAUSED → AI
  | 'RESOLVE' // any → terminal
  | 'START_AI'; // initial → AI

/**
 * Valid state transitions.
 */
const TRANSITIONS: Record<ConversationMode, Partial<Record<ConversationEvent, ConversationMode>>> = {
  AI_ACTIVE: {
    ESCALATE: 'HUMAN_ACTIVE',
    PAUSE: 'PAUSED',
    RESOLVE: 'PAUSED', // resolved conversations are paused
  },
  HUMAN_ACTIVE: {
    PAUSE: 'PAUSED',
    RESOLVE: 'PAUSED',
    START_AI: 'AI_ACTIVE', // human hands back to AI
  },
  PAUSED: {
    HUMAN_TAKEOVER: 'HUMAN_ACTIVE',
    RESUME: 'AI_ACTIVE',
    RESOLVE: 'PAUSED',
  },
};

/**
 * Conversation state record.
 */
export interface ConversationState {
  conversationId: string;
  currentMode: ConversationMode;
  history: Array<{ event: ConversationEvent; from: ConversationMode; timestamp: Date; to: ConversationMode }>;
  tenantId: string;
}

/**
 * State machine error.
 */
export class ConversationStateError extends Error {
  constructor(
    message: string,
    public readonly from: ConversationMode,
    public readonly event: ConversationEvent
  ) {
    super(message);
    this.name = 'ConversationStateError';
  }
}

/**
 * Conversation mode state machine.
 */
export class ConversationStateMachine {
  private states: Map<string, ConversationState> = new Map();

  /**
   * Initialize a conversation in AI_ACTIVE mode.
   */
  init(conversationId: string, tenantId: string, mode: ConversationMode = 'AI_ACTIVE'): ConversationState {
    const state: ConversationState = {
      conversationId,
      currentMode: mode,
      history: [],
      tenantId,
    };
    this.states.set(conversationId, state);
    return state;
  }

  /**
   * Get the current state of a conversation.
   */
  getState(conversationId: string): ConversationState | null {
    return this.states.get(conversationId) ?? null;
  }

  /**
   * Get the current mode of a conversation.
   */
  getMode(conversationId: string): ConversationMode | null {
    return this.states.get(conversationId)?.currentMode ?? null;
  }

  /**
   * Transition a conversation to a new mode.
   * @throws ConversationStateError if transition is invalid
   */
  transition(
    conversationId: string,
    event: ConversationEvent
  ): ConversationState {
    const state = this.states.get(conversationId);
    if (!state) {
      throw new ConversationStateError(
        `Conversation ${conversationId} not initialized`,
        'AI_ACTIVE',
        event
      );
    }

    const from = state.currentMode;
    const transitions = TRANSITIONS[from];
    const to = transitions?.[event];

    if (!to) {
      throw new ConversationStateError(
        `Invalid transition: ${event} from ${from}`,
        from,
        event
      );
    }

    const updated: ConversationState = {
      ...state,
      currentMode: to,
      history: [
        ...state.history,
        { event, from, timestamp: new Date(), to },
      ],
    };
    this.states.set(conversationId, updated);
    return updated;
  }

  /**
   * Check if a transition is valid.
   */
  canTransition(conversationId: string, event: ConversationEvent): boolean {
    const state = this.states.get(conversationId);
    if (!state) return false;
    const transitions = TRANSITIONS[state.currentMode];
    return Boolean(transitions?.[event]);
  }

  /**
   * Check if AI is currently active for a conversation.
   */
  isAiActive(conversationId: string): boolean {
    return this.getMode(conversationId) === 'AI_ACTIVE';
  }

  /**
   * Check if a human agent is active.
   */
  isHumanActive(conversationId: string): boolean {
    return this.getMode(conversationId) === 'HUMAN_ACTIVE';
  }

  /**
   * Check if conversation is paused.
   */
  isPaused(conversationId: string): boolean {
    return this.getMode(conversationId) === 'PAUSED';
  }

  /**
   * Clear state for a conversation.
   */
  clear(conversationId: string): void {
    this.states.delete(conversationId);
  }

  /**
   * Clear all state (for testing).
   */
  reset(): void {
    this.states.clear();
  }
}

/**
 * Default singleton instance.
 */
let defaultMachine: ConversationStateMachine | null = null;

/**
 * Get or create the default conversation state machine.
 */
export function getConversationStateMachine(): ConversationStateMachine {
  if (!defaultMachine) {
    defaultMachine = new ConversationStateMachine();
  }
  return defaultMachine;
}

/**
 * Reset the default machine (for testing).
 */
export function resetConversationStateMachine(): void {
  defaultMachine = null;
}

/**
 * Create a new state machine instance.
 */
export function createConversationStateMachine(): ConversationStateMachine {
  return new ConversationStateMachine();
}
