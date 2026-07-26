import { describe, expect, it } from 'vitest';

import { adapterFor } from './channel-adapters';

describe('adapterFor', () => {
  it('resolves mock-channel and whatsapp-meta', () => {
    expect(adapterFor('mock-channel')?.connectorKey).toBe('mock-channel');
    expect(adapterFor('whatsapp-meta')?.connectorKey).toBe('whatsapp-meta');
    expect(adapterFor('unknown')).toBeNull();
  });
});
