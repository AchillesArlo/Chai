import type { ChannelAdapter } from '@chai/connector-sdk';
import { createMockChannelAdapter } from '@chai/connectors/mock-channel';
import { createWhatsAppMetaSandboxAdapter } from '@chai/connectors/whatsapp-meta-sandbox';

import {
  API_CHANNEL_ACCOUNT_ID,
  API_TENANT_ID,
} from '../../database/api-ids';

/**
 * Resolve a channel provider key to a ChannelAdapter.
 * whatsapp-meta is sandbox (dry-run outbound, optional HMAC) until tokens land.
 */
export function adapterFor(provider: string): ChannelAdapter | null {
  if (provider === 'mock-channel') {
    return createMockChannelAdapter({
      channelAccount: API_CHANNEL_ACCOUNT_ID,
      provider: 'mock-channel',
      tenantId: API_TENANT_ID,
    });
  }
  if (provider === 'whatsapp-meta') {
    return createWhatsAppMetaSandboxAdapter({
      channelAccount: API_CHANNEL_ACCOUNT_ID,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      tenantId: API_TENANT_ID,
    });
  }
  return null;
}
