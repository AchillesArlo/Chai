import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

import { createHttpClient } from '@chai/api-client';
import { setDefaultHttpClient } from '@chai/api-client/react';

// ponytail: jsdom lacks EventSource; useInboxStream instantiates it at render time.
// Stub a no-op so components using SSE render without a real connection in tests.
class EventSourceStub {
  close() {}
  addEventListener() {}
  removeEventListener() {}
  onmessage = null;
  onerror = null;
  onopen = null;
  readyState = 0;
  url = '';
  withCredentials = false;
}

beforeAll(() => {
  setDefaultHttpClient(createHttpClient('http://test.local'));
  if (typeof globalThis.EventSource === 'undefined') {
    Object.defineProperty(globalThis, 'EventSource', { value: EventSourceStub, writable: true });
  }
});

afterEach(cleanup);
