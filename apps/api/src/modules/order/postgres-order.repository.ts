import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from '@chai/database';

import { API_SERVICE_PRINCIPAL_ID } from '../../database/api-ids';
import { DATABASE } from '../../database/database.module';
import {
  type CreateOrderInput,
  type Invoice,
  type Order,
  type OrderItem,
  OrderRepository,
  type ServiceItem,
} from './order.repository';

interface ServiceItemRow {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  unit_price_cents: number;
  currency: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface OrderRow {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  external_order_id: string | null;
  status: string;
  currency: string;
  total_cents: number;
  channel_id: string | null;
  campaign_id: string | null;
  conversation_id: string | null;
  agent_id: string | null;
  placed_at: Date;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface OrderItemRow {
  id: string;
  tenant_id: string;
  order_id: string;
  service_item_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  created_at: Date;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  order_id: string;
  external_invoice_number: string | null;
  status: string;
  total_cents: number;
  currency: string;
  payment_link: string | null;
  issued_at: Date;
  due_at: Date | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresOrderRepository extends OrderRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {
    super();
  }

  override async listServiceItems(tenantId: string): Promise<ServiceItem[]> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceItemRow[]>`
        SELECT * FROM chai.service_item
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY created_at DESC
      `;
      return rows.map((row) => mapServiceItem(row));
    });
  }

  override async getServiceItem(tenantId: string, id: string): Promise<ServiceItem | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceItemRow[]>`
        SELECT * FROM chai.service_item
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      return rows[0] ? mapServiceItem(rows[0]) : null;
    });
  }

  override async createServiceItem(
    tenantId: string,
    input: Omit<ServiceItem, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'status'> & { status?: 'active' | 'archived' },
  ): Promise<ServiceItem> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<ServiceItemRow[]>`
        INSERT INTO chai.service_item (id, tenant_id, sku, name, description, unit_price_cents, currency, status)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${input.sku}, ${input.name}, ${input.description ?? null},
                ${input.unitPriceCents}, ${input.currency}, ${input.status ?? 'active'})
        RETURNING *
      `;
      const row = rows[0];
      if (!row) throw new Error('service_item insert returned no row');
      return mapServiceItem(row);
    });
  }

  override async createOrder(tenantId: string, input: CreateOrderInput): Promise<Order> {
    const orderId = randomUUID();
    return this.tx(tenantId, async (tx) => {
      // Insert order shell first; total recompute via trigger after items.
      await tx`
        INSERT INTO chai.order (id, tenant_id, contact_id, external_order_id, currency, status,
                                channel_id, campaign_id, conversation_id, agent_id)
        VALUES (${orderId}::uuid, ${tenantId}::uuid,
                ${input.contactId ?? null}::uuid, ${input.externalOrderId ?? null},
                ${input.currency ?? 'IDR'}, 'open',
                ${input.channelId ?? null}::uuid, ${input.campaignId ?? null}::uuid,
                ${input.conversationId ?? null}::uuid, ${input.agentId ?? null}::uuid)
      `;
      const items: OrderItem[] = [];
      for (const line of input.items) {
        const catalog = await tx<ServiceItemRow[]>`
          SELECT * FROM chai.service_item
          WHERE tenant_id = ${tenantId}::uuid AND id = ${line.serviceItemId}::uuid AND status = 'active'
          FOR SHARE
        `;
        const c = catalog[0];
        if (!c) throw new Error(`Service item not found or not active: ${line.serviceItemId}`);
        const itemId = randomUUID();
        const lineTotal = c.unit_price_cents * line.quantity;
        await tx`
          INSERT INTO chai.order_item (id, tenant_id, order_id, service_item_id, sku, name,
                                       quantity, unit_price_cents, line_total_cents)
          VALUES (${itemId}::uuid, ${tenantId}::uuid, ${orderId}::uuid, ${c.id}::uuid,
                  ${c.sku}, ${c.name}, ${line.quantity}, ${c.unit_price_cents}, ${lineTotal})
        `;
        items.push({
          id: itemId,
          tenantId,
          orderId,
          serviceItemId: c.id,
          sku: c.sku,
          name: c.name,
          quantity: line.quantity,
          unitPriceCents: c.unit_price_cents,
          lineTotalCents: lineTotal,
          createdAt: new Date().toISOString(),
        });
      }
      // Trigger recompute_order_total already updated chai.order.total_cents.
      const orderRows = await tx<OrderRow[]>`
        SELECT * FROM chai.order WHERE id = ${orderId}::uuid
      `;
      const orderRow = orderRows[0];
      if (!orderRow) throw new Error('order insert returned no row');
      return mapOrder(orderRow, items);
    });
  }

  override async getOrder(tenantId: string, id: string): Promise<Order | null> {
    return this.tx(tenantId, async (tx) => {
      const orderRows = await tx<OrderRow[]>`
        SELECT * FROM chai.order WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      const o = orderRows[0];
      if (!o) return null;
      const itemRows = await tx<OrderItemRow[]>`
        SELECT * FROM chai.order_item WHERE order_id = ${id}::uuid ORDER BY created_at
      `;
      return mapOrder(o, itemRows.map(mapOrderItem));
    });
  }

  override async listOrders(tenantId: string): Promise<Order[]> {
    return this.tx(tenantId, async (tx) => {
      const orderRows = await tx<OrderRow[]>`
        SELECT * FROM chai.order WHERE tenant_id = ${tenantId}::uuid ORDER BY placed_at DESC LIMIT 100
      `;
      const result: Order[] = [];
      for (const o of orderRows) {
        const itemRows = await tx<OrderItemRow[]>`
          SELECT * FROM chai.order_item WHERE order_id = ${o.id}::uuid ORDER BY created_at
        `;
        result.push(mapOrder(o, itemRows.map(mapOrderItem)));
      }
      return result;
    });
  }

  override async createInvoice(
    tenantId: string,
    orderId: string,
    input?: { dueAt?: string; externalInvoiceNumber?: string },
  ): Promise<Invoice> {
    const id = randomUUID();
    return this.tx(tenantId, async (tx) => {
      // total_cents diambil dari order (yang konsisten dengan order_item via
      // trigger). Server-side, bukan input klien.
      const rows = await tx<InvoiceRow[]>`
        INSERT INTO chai.invoice (id, tenant_id, order_id, external_invoice_number, status,
                                  total_cents, currency, due_at)
        SELECT ${id}::uuid, ${tenantId}::uuid, o.id,
               ${input?.externalInvoiceNumber ?? null}, 'issued',
               o.total_cents, o.currency, ${input?.dueAt ?? null}::timestamptz
        FROM chai.order o
        WHERE o.id = ${orderId}::uuid AND o.tenant_id = ${tenantId}::uuid
        RETURNING *
      `;
      const row = rows[0];
      if (!row) throw new Error(`Order not found: ${orderId}`);
      return mapInvoice(row);
    });
  }

  override async getInvoice(tenantId: string, id: string): Promise<Invoice | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<InvoiceRow[]>`
        SELECT * FROM chai.invoice WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
      `;
      return rows[0] ? mapInvoice(rows[0]) : null;
    });
  }

  override async getInvoiceByOrder(tenantId: string, orderId: string): Promise<Invoice | null> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<InvoiceRow[]>`
        SELECT * FROM chai.invoice WHERE tenant_id = ${tenantId}::uuid AND order_id = ${orderId}::uuid
        ORDER BY issued_at DESC LIMIT 1
      `;
      return rows[0] ? mapInvoice(rows[0]) : null;
    });
  }

  override async markInvoicePaid(tenantId: string, id: string): Promise<Invoice> {
    return this.tx(tenantId, async (tx) => {
      const rows = await tx<InvoiceRow[]>`
        UPDATE chai.invoice
        SET status = 'paid', paid_at = NOW(), updated_at = NOW()
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND status = 'issued'
        RETURNING *
      `;
      const row = rows[0];
      if (!row) throw new Error(`Invoice not found or not in issued status: ${id}`);
      return mapInvoice(row);
    });
  }

  private tx<T>(tenantId: string, work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return withTenantTransaction(
      this.database,
      { principalId: API_SERVICE_PRINCIPAL_ID, tenantId },
      work,
    );
  }
}

function mapServiceItem(row: ServiceItemRow): ServiceItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unitPriceCents: row.unit_price_cents,
    currency: row.currency,
    status: row.status as 'active' | 'archived',
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    serviceItemId: row.service_item_id,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
    createdAt: row.created_at.toISOString(),
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contactId: row.contact_id,
    externalOrderId: row.external_order_id,
    status: row.status as Order['status'],
    currency: row.currency,
    totalCents: row.total_cents,
    channelId: row.channel_id,
    campaignId: row.campaign_id,
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    placedAt: row.placed_at.toISOString(),
    lastSyncedAt: row.last_synced_at ? row.last_synced_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items,
  };
}

function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orderId: row.order_id,
    externalInvoiceNumber: row.external_invoice_number,
    status: row.status as Invoice['status'],
    totalCents: row.total_cents,
    currency: row.currency,
    paymentLink: row.payment_link,
    issuedAt: row.issued_at.toISOString(),
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
