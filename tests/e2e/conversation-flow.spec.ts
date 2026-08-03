import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Conversation Flow
 * Webhook ingest → conversation creation → AI response → human takeover
 */
test.describe('conversation flow', () => {
  test('webhook ingest creates conversation', async ({ request }) => {
    // mock-channel (not 'mock' — see packages/connectors/src/connectors/mock-channel)
    // expects its own snake_case envelope; external_event_id/external_user_id
    // are required or normalizeWebhook reports verification.verified: false.
    const webhookPayload = {
      external_event_id: `conv-flow-evt-${Date.now()}`,
      external_message_id: `conv-flow-msg-${Date.now()}`,
      external_user_id: '+15551234567',
      text: 'Hello, I need help',
    };

    const ingest = await request.post(
      `${API_BASE}/api/service/v1/channels/mock-channel/webhook`,
      { data: webhookPayload },
    );
    expect(ingest.status()).toBe(201);
    const body = await ingest.json();
    expect(body.data.accepted).toBe(1);

    // Verify conversation appears in client portal
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(conversations.ok()).toBeTruthy();
    const conversationsBody = await conversations.json();
    expect(Array.isArray(conversationsBody.data)).toBeTruthy();
    expect(conversationsBody.data.length).toBeGreaterThan(0);
  });

  test('conversation transitions from AI to human mode', async ({ request }) => {
    // Create conversation via webhook
    const webhookPayload = {
      external_event_id: `conv-flow-evt-2-${Date.now()}`,
      external_message_id: `conv-flow-msg-2-${Date.now()}`,
      external_user_id: '+15559876543',
      text: 'I want to speak to a human',
    };

    await request.post(
      `${API_BASE}/api/service/v1/channels/mock-channel/webhook`,
      { data: webhookPayload },
    );

    // Fetch conversations to get the ID
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    const conversationsBody = await conversations.json();
    const conversation = conversationsBody.data.find(
      (c: { id: string }) => c.id,
    );
    expect(conversation).toBeDefined();

    // Evaluate action: AI mode allows AI actions
    const aiAction = await request.post(
      `${API_BASE}/api/client/v1/actions/evaluate`,
      {
        headers: {
          'Idempotency-Key': `conv-flow-ai-${Date.now()}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          mode: 'AI_ACTIVE',
          origin: 'ai',
          tool: 'knowledge.search',
          parameters: {},
        },
      },
    );
    expect(aiAction.ok()).toBeTruthy();
    const aiDecisionBody = await aiAction.json();
    expect(aiDecisionBody.data.kind).toBe('allow');

    // Evaluate action: Human takeover
    const humanAction = await request.post(
      `${API_BASE}/api/client/v1/actions/evaluate`,
      {
        headers: {
          'Idempotency-Key': `conv-flow-human-${Date.now()}`,
          'x-test-subject': 'local|client-owner',
        },
        data: {
          mode: 'HUMAN_ACTIVE',
          origin: 'human',
          tool: 'knowledge.search',
          parameters: {},
        },
      },
    );
    expect(humanAction.ok()).toBeTruthy();
    const humanDecisionBody = await humanAction.json();
    expect(humanDecisionBody.data.kind).toBe('allow');
  });
});
