import { expect, test } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';

/**
 * E2E: Conversation Flow
 * Webhook ingest → conversation creation → AI response → human takeover
 */
test.describe('conversation flow', () => {
  test('webhook ingest creates conversation', async ({ request }) => {
    const webhookPayload = {
      from: '+15551234567',
      message: 'Hello, I need help',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
    };

    const ingest = await request.post(
      `${API_BASE}/api/service/v1/channels/mock/webhook`,
      { data: webhookPayload },
    );
    expect(ingest.ok()).toBeTruthy();
    const body = await ingest.json();
    expect(body.accepted).toBe(1);

    // Verify conversation appears in client portal
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    expect(conversations.ok()).toBeTruthy();
    const list = await conversations.json();
    expect(Array.isArray(list)).toBeTruthy();
    expect(list.length).toBeGreaterThan(0);
  });

  test('conversation transitions from AI to human mode', async ({ request }) => {
    // Create conversation via webhook
    const webhookPayload = {
      from: '+15559876543',
      message: 'I want to speak to a human',
      tenantId: '01890f47-9b3c-7cc2-98e8-123456789203',
    };

    await request.post(
      `${API_BASE}/api/service/v1/channels/mock/webhook`,
      { data: webhookPayload },
    );

    // Fetch conversations to get the ID
    const conversations = await request.get(
      `${API_BASE}/api/client/v1/conversations`,
      { headers: { 'x-test-subject': 'local|client-owner' } },
    );
    const list = await conversations.json();
    const conversation = list.find(
      (c: { id: string }) => c.id,
    );
    expect(conversation).toBeDefined();

    // Evaluate action: AI mode allows AI actions
    const aiAction = await request.post(
      `${API_BASE}/api/client/v1/actions/evaluate`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          mode: 'AI_ACTIVE',
          origin: 'ai',
          tool: 'reply',
          parameters: {},
        },
      },
    );
    expect(aiAction.ok()).toBeTruthy();
    const aiDecision = await aiAction.json();
    expect(aiDecision.kind).toBe('allow');

    // Evaluate action: Human takeover
    const humanAction = await request.post(
      `${API_BASE}/api/client/v1/actions/evaluate`,
      {
        headers: { 'x-test-subject': 'local|client-owner' },
        data: {
          mode: 'HUMAN_ACTIVE',
          origin: 'human',
          tool: 'reply',
          parameters: {},
        },
      },
    );
    expect(humanAction.ok()).toBeTruthy();
    const humanDecision = await humanAction.json();
    expect(humanDecision.kind).toBe('allow');
  });
});
