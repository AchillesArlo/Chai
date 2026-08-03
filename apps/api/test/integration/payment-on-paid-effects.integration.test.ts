import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@chai/database';
import { signMockPaymentWebhook } from '@chai/connectors/mock-payment';

import { API_CLIENT_OWNER_ID, API_TENANT_ID } from '../../src/database/api-ids';
import { seedApiRuntime } from '../../src/database/seed-runtime';
import { PostgresPaymentsRepository } from '../../src/modules/payments/postgres-payments.repository';
import { PostgresOrderRepository } from '../../src/modules/order/postgres-order.repository';
import { OrderPaymentAdapter } from '../../src/modules/order/order-payment.adapter';
import { PostgresNotificationRepository } from '../../src/modules/notification/postgres-notification.repository';
import { NotificationPaymentAdapter } from '../../src/modules/notification/notification-payment.adapter';

describe('Payment on-PAID effects (REQ-17-019)', () => {
  const adminUrl = inject('adminDatabaseUrl') as string;
  const runtimeUrl = inject('runtimeDatabaseUrl') as string;
  let admin: ReturnType<typeof createDatabase>;
  let runtime: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    admin = createDatabase(adminUrl);
    runtime = createDatabase(runtimeUrl);
    await seedApiRuntime(admin);
  });

  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it('triggers order/invoice paid, cancels follow_up_job, creates notification exactly once on PAID webhook', async () => {
    const orderRepo = new PostgresOrderRepository(runtime);
    const notifRepo = new PostgresNotificationRepository(runtime);
    const orderAdapter = new OrderPaymentAdapter(orderRepo);
    const notifAdapter = new NotificationPaymentAdapter(notifRepo);
    const payments = new PostgresPaymentsRepository(
      runtime,
      undefined,
      orderAdapter,
      notifAdapter,
    );

    // 1. Setup service item, order, invoice
    const serviceItem = await orderRepo.createServiceItem(API_TENANT_ID, {
      currency: 'IDR',
      description: 'Test product for payment',
      name: 'Product A',
      sku: `sku-onpaid-${Date.now()}`,
      unitPriceCents: 50_000,
    });

    const order = await orderRepo.createOrder(API_TENANT_ID, {
      items: [{ quantity: 2, serviceItemId: serviceItem.id }],
    });

    const invoice = await orderRepo.createInvoice(API_TENANT_ID, order.id);

    // 2. Create checkout (which also schedules a follow_up_job reminder)
    const session = await payments.createCheckout(API_TENANT_ID, {
      amount: invoice.totalCents,
      currency: invoice.currency,
      idempotencyKey: `idem-onpaid-${Date.now()}`,
      invoiceId: invoice.id,
      orderId: order.id,
    });

    // Fetch payment UUID
    const paymentRows = await admin<{ id: string }[]>`
      SELECT id FROM chai.payment WHERE tenant_id = ${API_TENANT_ID} AND external_id = ${session.externalId}
    `;
    const firstPayment = paymentRows[0];
    if (!firstPayment) throw new Error('Payment row missing');
    const paymentId = firstPayment.id;

    const initialJobs = await admin<{ id: string; status: string }[]>`
      SELECT id, status FROM chai.follow_up_job
      WHERE tenant_id = ${API_TENANT_ID} AND payment_id = ${paymentId}::uuid
    `;
    expect(initialJobs.length).toBe(1);
    const firstJob = initialJobs[0];
    if (!firstJob) throw new Error('Initial job missing');
    expect(firstJob.status).toBe('PENDING');

    // Count initial notifications for client owner
    const initialNotifs = await notifRepo.listNotifications(API_TENANT_ID, API_CLIENT_OWNER_ID);
    const initialNotifCount = initialNotifs.length;

    // 3. Apply PAID webhook first time
    const providerEventId = `evt-paid-${Date.now()}`;
    const raw = Buffer.from(
      JSON.stringify({
        eventAt: new Date().toISOString(),
        externalId: session.externalId,
        providerEventId,
        status: 'PAID',
        tenantId: API_TENANT_ID,
      }),
    );

    const firstResult = await payments.applyWebhook('mock-payment', raw, signMockPaymentWebhook(raw));
    expect(firstResult.verified).toBe(true);
    expect(firstResult.event?.status).toBe('PAID');

    // Check 1: Invoice status is paid
    const updatedInvoice = await orderRepo.getInvoice(API_TENANT_ID, invoice.id);
    expect(updatedInvoice?.status).toBe('paid');
    expect(updatedInvoice?.paidAt).not.toBeNull();

    // Check 2: follow_up_job status is CANCELLED
    const cancelledJobs = await admin<{ id: string; status: string }[]>`
      SELECT id, status FROM chai.follow_up_job
      WHERE tenant_id = ${API_TENANT_ID} AND payment_id = ${paymentId}::uuid
    `;
    expect(cancelledJobs.length).toBe(1);
    const firstCancelledJob = cancelledJobs[0];
    if (!firstCancelledJob) throw new Error('Cancelled job missing');
    expect(firstCancelledJob.status).toBe('CANCELLED');

    // Check 3: Notification created
    const updatedNotifs = await notifRepo.listNotifications(API_TENANT_ID, API_CLIENT_OWNER_ID);
    expect(updatedNotifs.length).toBe(initialNotifCount + 1);
    const newNotif = updatedNotifs[0];
    if (!newNotif) throw new Error('New notification missing');
    expect(newNotif.title).toContain('Pembayaran');

    // 4. Replay same webhook (same providerEventId)
    const replayResult = await payments.applyWebhook('mock-payment', raw, signMockPaymentWebhook(raw));
    expect(replayResult.verified).toBe(true);

    // Check 4: No double effect
    const recheckedNotifs = await notifRepo.listNotifications(API_TENANT_ID, API_CLIENT_OWNER_ID);
    expect(recheckedNotifs.length).toBe(initialNotifCount + 1);

    const recheckedJobs = await admin<{ id: string; status: string }[]>`
      SELECT id, status FROM chai.follow_up_job
      WHERE tenant_id = ${API_TENANT_ID} AND payment_id = ${paymentId}::uuid
    `;
    expect(recheckedJobs.length).toBe(1);
    const recheckedJob = recheckedJobs[0];
    if (!recheckedJob) throw new Error('Rechecked job missing');
    expect(recheckedJob.status).toBe('CANCELLED');
  });
});
