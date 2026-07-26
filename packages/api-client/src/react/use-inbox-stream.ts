'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, InboxEvent } from '../types';
import { SSEClient } from '../sse-client';

/**
 * Props for useInboxStream hook
 */
interface UseInboxStreamOptions {
  url: string;
  enabled?: boolean;
  onEvent?: (event: InboxEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

/**
 * Return type for useInboxStream hook
 */
interface UseInboxStreamReturn {
  status: ConnectionStatus;
  events: InboxEvent[];
  clearEvents: () => void;
}

/**
 * React hook for SSE inbox stream with auto-reconnect
 */
export function useInboxStream(options: UseInboxStreamOptions): UseInboxStreamReturn {
  const { url, enabled = true, onEvent, onStatusChange } = options;
  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const clientRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Create SSE client
    const client = new SSEClient(url);
    clientRef.current = client;

    // Set up callbacks
    client.onStatus((newStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    });

    client.onMessage((event) => {
      setEvents((prev) => [...prev, event]);
      onEvent?.(event);
    });

    // Connect
    client.connect();

    // Cleanup on unmount
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [url, enabled, onEvent, onStatusChange]);

  const clearEvents = () => {
    setEvents([]);
  };

  return {
    status,
    events,
    clearEvents,
  };
}
