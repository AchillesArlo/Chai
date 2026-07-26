// ponytail: in-process EventEmitter; swap for Redis pub/sub when multi-instance

export type ConversationEventType =
  | 'conversation.created'
  | 'conversation.updated';

export interface ConversationEventPayload {
  assigneeUserId: string | null;
  contactId: string;
  externalUserId: string;
  id: string;
  lastMessageAt: string;
  mode: string;
  provider: string;
  status: string;
  version: number;
}

export interface ConversationEvent {
  type: ConversationEventType;
  tenantId: string;
  conversationId: string;
  payload: ConversationEventPayload;
}

export type ConversationEventHandler = (event: ConversationEvent) => void;

export interface RealtimeBus {
  publish(channel: string, event: ConversationEvent): void;
  subscribe(channel: string, handler: ConversationEventHandler): () => void;
}

export function createRealtimeBus(): RealtimeBus {
  const subscribers = new Map<string, Set<ConversationEventHandler>>();

  return {
    publish(channel, event) {
      const handlers = subscribers.get(channel);
      if (handlers) {
        for (const handler of handlers) handler(event);
      }
    },
    subscribe(channel, handler) {
      let handlers = subscribers.get(channel);
      if (!handlers) {
        handlers = new Set();
        subscribers.set(channel, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers?.delete(handler);
      };
    },
  };
}

export const realtimeBus: RealtimeBus = createRealtimeBus();
