import { decideVersionGate } from '@chai/contracts';

import type { ConnectionStatus, InboxEvent } from './types';

/**
 * Reconnection delay configuration
 */
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const; // Max 30s

/**
 * Event buffer flush interval (ms)
 */
const BUFFER_FLUSH_INTERVAL = 100;

/**
 * SSE Client with auto-reconnect and backpressure handling
 */
export class SSEClient {
  private url: string;
  private eventSource: EventSource | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventBuffer: InboxEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onEvent?: (event: InboxEvent) => void;
  /** Last applied aggregate version, so stale redeliveries can be dropped. */
  private readonly seenVersions = new Map<string, number>();
  private onRefetchRequired?: (aggregateId: string) => void;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Called when a version gap means the client can no longer rebuild state from
   * the stream and must refetch the aggregate.
   */
  onRefetch(callback: (aggregateId: string) => void): void {
    this.onRefetchRequired = callback;
  }

  /**
   * Set status change callback
   */
  onStatus(callback: (status: ConnectionStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * Set event handler callback
   */
  onMessage(callback: (event: InboxEvent) => void): void {
    this.onEvent = callback;
  }

  /**
   * Update connection status
   */
  private setStatus(newStatus: ConnectionStatus): void {
    this.status = newStatus;
    this.onStatusChange?.(newStatus);
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      return;
    }

    this.setStatus('CONNECTING');

    // Create EventSource with credentials for cookie auth
    this.eventSource = new EventSource(this.url, { withCredentials: true });

    // Connection opened
    this.eventSource.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus('CONNECTED');
      this.startBufferFlush();
    };

    // Handle specific event types
    this.eventSource.addEventListener('MESSAGE_RECEIVED', (e) => this.handleEvent(e));
    this.eventSource.addEventListener('CONVERSATION_UPDATED', (e) => this.handleEvent(e));
    this.eventSource.addEventListener('AGENT_ASSIGNED', (e) => this.handleEvent(e));
    this.eventSource.addEventListener('TYPING_INDICATOR', (e) => this.handleEvent(e));

    // Handle errors
    this.eventSource.onerror = () => {
      this.setStatus('DISCONNECTED');
      this.eventSource?.close();
      this.eventSource = null;
      this.scheduleReconnect();
    };
  }

  /**
   * Handle incoming SSE event
   */
  private handleEvent(event: MessageEvent): void {
    try {
      const frame = JSON.parse(event.data) as {
        aggregateId?: string | null;
        payload?: unknown;
        version?: number | null;
      };
      // Frames from the realtime gateway are enveloped; anything else is treated
      // as a bare payload so older producers keep working.
      const enveloped =
        frame !== null &&
        typeof frame === 'object' &&
        ('payload' in frame || 'version' in frame);

      if (enveloped && frame.aggregateId) {
        const decision = decideVersionGate(
          this.seenVersions.get(frame.aggregateId),
          { version: frame.version ?? undefined },
        );
        if (decision === 'IGNORE_STALE') {
          // A duplicate or out-of-order redelivery: applying it would move the
          // UI backwards (06_API §11).
          return;
        }
        if (decision === 'REFETCH_REQUIRED') {
          this.seenVersions.delete(frame.aggregateId);
          this.onRefetchRequired?.(frame.aggregateId);
          return;
        }
        if (typeof frame.version === 'number') {
          this.seenVersions.set(frame.aggregateId, frame.version);
        }
      }

      const data = (enveloped ? frame.payload : frame) as InboxEvent;
      data.type = event.type as InboxEvent['type'];

      // Add to buffer for backpressure handling
      this.eventBuffer.push(data);
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
    }
  }

  /**
   * Start periodic buffer flush
   */
  private startBufferFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Flush event buffer
   */
  private flushBuffer(): void {
    if (this.eventBuffer.length === 0) {
      return;
    }

    // Process all buffered events
    const events = this.eventBuffer.splice(0, this.eventBuffer.length);
    for (const event of events) {
      this.onEvent?.(event);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)] ?? RECONNECT_DELAYS[0];
    this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, RECONNECT_DELAYS.length - 1);

    this.setStatus('RECONNECTING');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.flushBuffer();
    this.setStatus('DISCONNECTED');
    this.reconnectAttempt = 0;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }
}

/**
 * Create SSE client instance
 */
export function createSSEClient(url: string): SSEClient {
  return new SSEClient(url);
}
