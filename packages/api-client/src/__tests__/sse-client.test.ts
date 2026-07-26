import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEClient } from '../sse-client';

/**
 * Mock EventSource class for testing
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners: Map<string, Array<(event: MessageEvent) => void>> = new Map();
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    let arr = this.listeners.get(type);
    if (!arr) {
      arr = [];
      this.listeners.set(type, arr);
    }
    arr.push(listener);
  }

  removeEventListener(): void {
    // no-op for mock
  }

  close(): void {
    this.readyState = 2;
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }

  simulateMessage(type: string, data: string): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = new MessageEvent(type, { data });
      for (const listener of listeners) {
        listener(event);
      }
    }
  }
}

describe('SSEClient', () => {
  let client: SSEClient;
  const url = 'https://realtime.example.com/stream';

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    client?.disconnect();
    vi.restoreAllMocks();
  });

  function getLastMockInstance(): MockEventSource {
    const instance = MockEventSource.instances.at(-1);
    if (!instance) {
      throw new Error('Expected a MockEventSource instance to have been created');
    }
    return instance;
  }

  it('should create SSE client with DISCONNECTED status', () => {
    client = new SSEClient(url);
    expect(client.getStatus()).toBe('DISCONNECTED');
  });

  it('should connect to SSE endpoint', () => {
    client = new SSEClient(url);
    client.connect();

    expect(MockEventSource.instances.length).toBe(1);
    expect(getLastMockInstance().url).toBe(url);
    expect(client.getStatus()).toBe('CONNECTING');
  });

  it('should update status to CONNECTED on open', () => {
    client = new SSEClient(url);
    const statusHandler = vi.fn();
    client.onStatus(statusHandler);

    client.connect();
    getLastMockInstance().simulateOpen();

    expect(statusHandler).toHaveBeenCalledWith('CONNECTED');
  });

  it('should register event listeners for inbox events', () => {
    client = new SSEClient(url);
    client.connect();

    const mock = getLastMockInstance();
    expect(mock.listeners.has('MESSAGE_RECEIVED')).toBe(true);
    expect(mock.listeners.has('CONVERSATION_UPDATED')).toBe(true);
    expect(mock.listeners.has('AGENT_ASSIGNED')).toBe(true);
    expect(mock.listeners.has('TYPING_INDICATOR')).toBe(true);
  });

  it('should disconnect and clean up', () => {
    client = new SSEClient(url);
    client.connect();

    const mock = getLastMockInstance();
    client.disconnect();

    expect(mock.readyState).toBe(2); // CLOSED
    expect(client.getStatus()).toBe('DISCONNECTED');
  });

  it('should call status callback on status change', () => {
    client = new SSEClient(url);
    const statusHandler = vi.fn();
    client.onStatus(statusHandler);

    client.connect();
    expect(statusHandler).toHaveBeenCalledWith('CONNECTING');

    client.disconnect();
    expect(statusHandler).toHaveBeenCalledWith('DISCONNECTED');
  });

  it('should not connect twice', () => {
    client = new SSEClient(url);
    client.connect();
    client.connect();

    expect(MockEventSource.instances.length).toBe(1);
  });

  it('should buffer events and flush them', async () => {
    client = new SSEClient(url);
    const eventHandler = vi.fn();
    client.onMessage(eventHandler);

    client.connect();
    const mock = getLastMockInstance();
    mock.simulateOpen();

    // Simulate incoming events
    mock.simulateMessage('MESSAGE_RECEIVED', JSON.stringify({
      type: 'MESSAGE_RECEIVED',
      data: { id: 'msg-1', text: 'Hello' },
      timestamp: new Date().toISOString(),
    }));

    // Wait for buffer flush (100ms interval)
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MESSAGE_RECEIVED',
        data: { id: 'msg-1', text: 'Hello' },
      })
    );
  });

  it('should schedule reconnect on error', () => {
    vi.useFakeTimers();
    client = new SSEClient(url);
    const statusHandler = vi.fn();
    client.onStatus(statusHandler);

    client.connect();
    const mock = getLastMockInstance();
    mock.simulateOpen();
    mock.simulateError();

    expect(statusHandler).toHaveBeenCalledWith('DISCONNECTED');
    expect(statusHandler).toHaveBeenCalledWith('RECONNECTING');

    vi.useRealTimers();
  });
});
