import { createHmac } from 'node:crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createWhatsAppMetaAdapter, verifyWebhookSignature } from '../src/connectors/whatsapp-meta';

const TENANT = '01890f47-9b3c-7cc2-98e8-123456789203';
const ACCOUNT = '01890f47-9b3c-7cc2-98e8-12345678930a';
const PHONE_NUMBER_ID = '123456789';

describe('WhatsApp Meta production adapter', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('verifies valid HMAC-SHA256 signature', () => {
      const secret = 'test-secret';
      const payload = new TextEncoder().encode('{"test":"data"}');
      const expected = createHmac('sha256', secret).update(payload).digest('hex');
      const signature = `sha256=${expected}`;

      const result = verifyWebhookSignature(payload, signature, secret);
      expect(result.verified).toBe(true);
    });

    it('rejects invalid signature', () => {
      const secret = 'test-secret';
      const payload = new TextEncoder().encode('{"test":"data"}');
      const signature = 'sha256=invalid';

      const result = verifyWebhookSignature(payload, signature, secret);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('signature mismatch');
    });

    it('rejects malformed signature header', () => {
      const secret = 'test-secret';
      const payload = new TextEncoder().encode('{"test":"data"}');

      const result = verifyWebhookSignature(payload, 'invalid', secret);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('missing or malformed X-Hub-Signature-256');
    });

    it('skips verification when no secret configured', () => {
      const payload = new TextEncoder().encode('{"test":"data"}');
      const result = verifyWebhookSignature(payload, undefined, '');
      expect(result.verified).toBe(true);
    });
  });

  describe('adapter (sandbox mode)', () => {
    it('returns sandbox capabilities when no token', async () => {
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const manifest = await adapter.discoverCapabilities();
      expect(manifest.connectorKey).toBe('whatsapp-meta');
      expect(manifest.riskClass).toBe('META_DIRECT');
      expect(manifest.slaClass).toBe('SYNTHETIC');
      expect(manifest.capabilities.send_media).toBe(false);
    });

    it('returns healthy in sandbox mode', async () => {
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.reason).toContain('sandbox');
    });

    it('returns dry-run result in sandbox mode', async () => {
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const result = await adapter.sendMessage({
        channelAccount: ACCOUNT,
        content: { contentType: 'TEXT', text: 'Test message' },
        externalUserId: '628123456789',
        idempotencyKey: 'test-idem',
        provider: 'whatsapp-meta',
        tenantId: TENANT,
      });

      expect(result.success).toBe(true);
      expect(result.externalId).toContain('wamid.sandbox');
      expect(result.retryable).toBe(false);
    });

    it('normalizes Meta webhook payload', async () => {
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.ABC123',
                      timestamp: '1720000000',
                      type: 'text',
                      text: { body: 'Halo jadwal' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const { events, verification } = await adapter.normalizeWebhook({
        raw: new TextEncoder().encode(payload),
      });

      expect(verification.verified).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]?.externalUserId).toBe('628123456789');
      expect(events[0]?.externalEventId).toBe('wamid.ABC123');
      expect(events[0]?.content.text).toBe('Halo jadwal');
      expect(events[0]?.provider).toBe('whatsapp-meta');
    });

    it('rejects webhook with bad signature when secret configured', async () => {
      const secret = 'test-secret';
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
        appSecret: secret,
      });

      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.ABC123',
                      type: 'text',
                      text: { body: 'Test' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const raw = new TextEncoder().encode(payload);
      const { verification } = await adapter.normalizeWebhook({
        raw,
        signature: 'sha256=bad',
      });

      expect(verification.verified).toBe(false);
    });

    it('accepts webhook with valid signature', async () => {
      const secret = 'test-secret';
      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
        appSecret: secret,
      });

      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.ABC123',
                      type: 'text',
                      text: { body: 'Test' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const raw = new TextEncoder().encode(payload);
      const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

      const { events, verification } = await adapter.normalizeWebhook({
        raw,
        signature,
      });

      expect(verification.verified).toBe(true);
      expect(events).toHaveLength(1);
    });
  });

  describe('adapter (production mode)', () => {
    it('returns production capabilities when token configured', async () => {
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');

      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const manifest = await adapter.discoverCapabilities();
      expect(manifest.slaClass).toBe('STAGING');
      expect(manifest.capabilities.send_media).toBe(true);
    });

    it('calls Graph API when token configured', async () => {
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.real123' }],
        }),
      });
      global.fetch = mockFetch;

      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const result = await adapter.sendMessage({
        channelAccount: ACCOUNT,
        content: { contentType: 'TEXT', text: 'Test message' },
        externalUserId: '628123456789',
        idempotencyKey: 'test-idem',
        provider: 'whatsapp-meta',
        tenantId: TENANT,
      });

      expect(result.success).toBe(true);
      expect(result.externalId).toBe('wamid.real123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/v18.0/${PHONE_NUMBER_ID}/messages`),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('handles Graph API errors correctly', async () => {
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: 'Invalid token',
            type: 'OAuthException',
            code: 190,
          },
        }),
      });
      global.fetch = mockFetch;

      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const result = await adapter.sendMessage({
        channelAccount: ACCOUNT,
        content: { contentType: 'TEXT', text: 'Test' },
        externalUserId: '628123456789',
        idempotencyKey: 'test-idem',
        provider: 'whatsapp-meta',
        tenantId: TENANT,
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('AUTH');
    });

    it('handles rate limiting with retry', async () => {
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
            type: 'OAuthException',
            code: 4,
          },
        }),
      });
      global.fetch = mockFetch;

      const adapter = createWhatsAppMetaAdapter({
        phoneNumberId: PHONE_NUMBER_ID,
        channelAccount: ACCOUNT,
        tenantId: TENANT,
      });

      const result = await adapter.sendMessage({
        channelAccount: ACCOUNT,
        content: { contentType: 'TEXT', text: 'Test' },
        externalUserId: '628123456789',
        idempotencyKey: 'test-idem',
        provider: 'whatsapp-meta',
        tenantId: TENANT,
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('RATE_LIMIT');
      expect(result.retryAfterMs).toBe(60_000);
    });
  });
});
