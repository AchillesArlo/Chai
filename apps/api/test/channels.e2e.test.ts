import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { realtimeBus, type ConversationEvent } from '@chai/realtime-gateway';

import { API_TENANT_ID } from '../src/database/api-ids';
import { createApplication } from '../src/bootstrap';

describe('channels webhook simulator and conversations', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('ingests a mock-channel webhook and exposes the conversation to the tenant', async () => {
    const accepted = await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'wh-evt-1',
        external_message_id: 'wh-msg-1',
        external_user_id: 'wh-customer-1',
        text: 'Saya mau tanya jadwal',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().data.accepted).toBe(1);

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    expect(conversations.statusCode).toBe(200);
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    expect(data.map((row) => row.externalUserId)).toContain('wh-customer-1');
  });

  it('collapses repeat inbound from one user into the same conversation', async () => {
    await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'wh-evt-2',
        external_message_id: 'wh-msg-2',
        external_user_id: 'wh-customer-repeat',
        text: 'first',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });
    await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'wh-evt-3',
        external_message_id: 'wh-msg-3',
        external_user_id: 'wh-customer-repeat',
        text: 'second',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    const repeatRows = data.filter((row) => row.externalUserId === 'wh-customer-repeat');
    expect(repeatRows).toHaveLength(1);
  });

  it('ingests a whatsapp-meta Meta Cloud API webhook envelope', async () => {
    const accepted = await app.inject({
      method: 'POST',
      payload: {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  messages: [
                    {
                      from: '628111222333',
                      id: 'wamid.e2e-1',
                      timestamp: '1720000000',
                      type: 'text',
                      text: { body: 'WhatsApp e2e' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      url: '/api/service/v1/channels/whatsapp-meta/webhook',
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().data.accepted).toBe(1);

    const conversations = await app.inject({
      headers: { 'x-test-subject': 'local|client-owner' },
      method: 'GET',
      url: '/api/client/v1/conversations',
    });
    const data = conversations.json().data as Array<{ externalUserId: string }>;
    expect(data.map((row) => row.externalUserId)).toContain('628111222333');
  });

  it('rejects an unknown channel provider', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: { data: {} },
      url: '/api/service/v1/channels/unknown-provider/webhook',
    });

    expect(response.statusCode).toBe(404);
  });

  it('requires an idempotency key for the webhook mutation', async () => {
    // Webhook is provider-facing (signature-verified in production), so it
    // bypasses the idempotency key gate — assert it accepts without one.
    const response = await app.inject({
      method: 'POST',
      payload: {
        external_event_id: 'wh-evt-no-idem',
        external_message_id: 'wh-msg-no-idem',
        external_user_id: 'wh-customer-no-idem',
        text: 'ok',
      },
      url: '/api/service/v1/channels/mock-channel/webhook',
    });

    expect(response.statusCode).toBe(201);
  });

  it('publishes a conversation.created event to the realtime bus on ingest', async () => {
    let captured: ConversationEvent | undefined;
    const unsubscribe = realtimeBus.subscribe(API_TENANT_ID, (event) => {
      captured = event;
    });

    try {
      const response = await app.inject({
        method: 'POST',
        payload: {
          external_event_id: 'wh-evt-rt-1',
          external_message_id: 'wh-msg-rt-1',
          external_user_id: 'wh-customer-rt',
          text: 'realtime check',
        },
        url: '/api/service/v1/channels/mock-channel/webhook',
      });

      expect(response.statusCode).toBe(201);
      expect(captured).toBeDefined();
      expect(captured?.type).toBe('conversation.created');
      expect(captured?.tenantId).toBe(API_TENANT_ID);
      expect(captured?.payload.externalUserId).toBe('wh-customer-rt');
    } finally {
      unsubscribe();
    }
  });
});

