import { Inject, Injectable } from '@nestjs/common';

import { PaymentOrderPort, type OrderAmountRef } from '../shared/action-tool.port';
import { OrderRepository } from './order.repository';

/**
 * Implements the shared PaymentOrderPort by delegating to this module's own
 * repository — the only place allowed to depend on OrderRepository directly
 * (02 §5). PaymentsController resolves checkout amounts through this port
 * instead of importing ../order/order.repository.
 */
@Injectable()
export class OrderPaymentAdapter extends PaymentOrderPort {
  constructor(
    @Inject('OrderRepository') private readonly repository: OrderRepository,
  ) {
    super();
  }

  override async getInvoiceAmount(
    tenantId: string,
    invoiceId: string,
  ): Promise<OrderAmountRef | null> {
    const invoice = await this.repository.getInvoice(tenantId, invoiceId);
    if (!invoice) return null;
    return {
      currency: invoice.currency,
      invoiceId: invoice.id,
      invoiceStatus: invoice.status,
      orderId: invoice.orderId,
      totalCents: invoice.totalCents,
    };
  }

  override async getOrderAmount(
    tenantId: string,
    orderId: string,
  ): Promise<OrderAmountRef | null> {
    const order = await this.repository.getOrder(tenantId, orderId);
    if (!order) return null;
    return {
      currency: order.currency,
      orderId: order.id,
      totalCents: order.totalCents,
    };
  }

  override async markInvoicePaid(
    tenantId: string,
    invoiceId: string,
  ): Promise<void> {
    await this.repository.markInvoicePaid(tenantId, invoiceId);
  }
}
