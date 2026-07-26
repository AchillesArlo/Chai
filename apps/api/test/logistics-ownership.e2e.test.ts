import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/bootstrap';
import { LogisticsModule } from '../src/modules/logistics/logistics.module';
import { LogisticsRepository } from '../src/modules/logistics/logistics.repository';

/**
 * Fase 2 (R-15) regression: a tracking number alone must never disclose a
 * shipment to a customer-facing caller.
 *
 * A tracking number is guessable, so the customer path requires proof of
 * ownership — the owning contact or the order reference — and fails closed when
 * the shipment has no recorded owner (ADR-027, 17 §7.3).
 */

const TENANT_A = '01890f47-9b3c-7cc2-98e8-123456789203';
const CONTACT = '01890f47-9b3c-7cc2-98e8-1234567894a1';

describe('customer shipment lookup requires ownership', () => {
  let app: NestFastifyApplication;
  let repository: LogisticsRepository;

  beforeAll(async () => {
    app = await createApplication({ environment: 'test' });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    repository = app.select(LogisticsModule).get(LogisticsRepository);

    await repository.link(TENANT_A, {
      carrier: 'jne',
      contactId: CONTACT,
      orderReference: 'ORDER-1',
      trackingNumber: 'TRK-OWNED',
    });
    await repository.link(TENANT_A, {
      carrier: 'jne',
      trackingNumber: 'TRK-UNOWNED',
    });
  });

  afterAll(async () => app.close());

  it('discloses the timeline to the owning contact', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-OWNED', {
      contactId: CONTACT,
    });

    expect(view).not.toBeNull();
    expect(view?.trackingNumber).toBe('TRK-OWNED');
  });

  it('accepts the order reference as proof', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-OWNED', {
      orderReference: 'ORDER-1',
    });

    expect(view).not.toBeNull();
  });

  it('reveals nothing without proof', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-OWNED', {});

    expect(view).toBeNull();
  });

  it('reveals nothing for a wrong contact', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-OWNED', {
      contactId: '01890f47-9b3c-7cc2-98e8-1234567894ff',
    });

    expect(view).toBeNull();
  });

  it('fails closed when the shipment has no recorded owner', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-UNOWNED', {
      contactId: CONTACT,
    });

    expect(view).toBeNull();
  });

  it('reveals nothing for a guessed tracking number', async () => {
    const view = await repository.customerLookup(TENANT_A, 'TRK-GUESSED', {
      contactId: CONTACT,
    });

    expect(view).toBeNull();
  });
});
