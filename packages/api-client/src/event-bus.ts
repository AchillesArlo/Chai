import type { ApiError } from './errors';

/**
 * Event types for global error handling
 */
export type ApiEventType = 'error' | 'auth-error' | 'network-error';

/**
 * Event handler callback
 */
export type ApiEventHandler = (error: ApiError) => void;

/**
 * Simple event emitter for API errors
 */
class ApiEventBus {
  private listeners: Map<ApiEventType, Set<ApiEventHandler>> = new Map();

  /**
   * Subscribe to API events
   */
  on(event: ApiEventType, handler: ApiEventHandler): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an API event
   */
  emit(event: ApiEventType, error: ApiError): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(error);
        } catch (err) {
          console.error(`Error in ${event} handler:`, err);
        }
      }
    }
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Global API event bus instance
 */
export const apiEventBus = new ApiEventBus();
