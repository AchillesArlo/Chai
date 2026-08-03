import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * FASE 6 — Sumber amount tepercaya (§11.2/11.3/11.4).
 *
 * Rantai: service_item (katalog) -> order + order_item (snapshot harga
 * immutable) -> invoice. Amount payment dihitung server-side dari invoice,
 * bukan input klien — menutup REQ-17-021 ("amount dari sumber tepercaya;
 * AI tak mengarang harga").
 */

export interface ServiceItem {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  unitPriceCents: number;
  currency: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  serviceItemId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  createdAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  contactId: string | null;
  externalOrderId: string | null;
  status: 'open' | 'confirmed' | 'cancelled' | 'fulfilled';
  currency: string;
  totalCents: number;
  channelId: string | null;
  campaignId: string | null;
  conversationId: string | null;
  agentId: string | null;
  placedAt: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface Invoice {
  id: string;
  tenantId: string;
  orderId: string;
  externalInvoiceNumber: string | null;
  status: 'issued' | 'paid' | 'void' | 'overdue';
  totalCents: number;
  currency: string;
  paymentLink: string | null;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemInput {
  serviceItemId: string;
  quantity: number;
}

export interface CreateOrderInput {
  contactId?: string;
  externalOrderId?: string;
  currency?: string;
  channelId?: string;
  campaignId?: string;
  conversationId?: string;
  agentId?: string;
  items: CreateOrderItemInput[];
}

export abstract class OrderRepository {
  abstract listServiceItems(tenantId: string): Promise<ServiceItem[]>;
  abstract getServiceItem(tenantId: string, id: string): Promise<ServiceItem | null>;
  abstract createServiceItem(
    tenantId: string,
    input: Omit<ServiceItem, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'status'> & { status?: 'active' | 'archived' },
  ): Promise<ServiceItem>;
  abstract createOrder(tenantId: string, input: CreateOrderInput): Promise<Order>;
  abstract getOrder(tenantId: string, id: string): Promise<Order | null>;
  abstract listOrders(tenantId: string): Promise<Order[]>;
  abstract createInvoice(tenantId: string, orderId: string, input?: { dueAt?: string; externalInvoiceNumber?: string }): Promise<Invoice>;
  abstract getInvoice(tenantId: string, id: string): Promise<Invoice | null>;
  abstract getInvoiceByOrder(tenantId: string, orderId: string): Promise<Invoice | null>;
  abstract markInvoicePaid(tenantId: string, id: string): Promise<Invoice>;
}

@Injectable()
export class InMemoryOrderRepository extends OrderRepository {
  private serviceItems = new Map<string, ServiceItem>();
  private orders = new Map<string, Order>();
  private orderItems = new Map<string, OrderItem[]>();
  private invoices = new Map<string, Invoice>();

  async listServiceItems(tenantId: string): Promise<ServiceItem[]> {
    return [...this.serviceItems.values()].filter((s) => s.tenantId === tenantId);
  }

  async getServiceItem(tenantId: string, id: string): Promise<ServiceItem | null> {
    const item = this.serviceItems.get(id);
    return item && item.tenantId === tenantId ? item : null;
  }

  async createServiceItem(
    tenantId: string,
    input: Omit<ServiceItem, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'status'> & { status?: 'active' | 'archived' },
  ): Promise<ServiceItem> {
    const now = new Date().toISOString();
    const item: ServiceItem = {
      id: randomUUID(),
      tenantId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      unitPriceCents: input.unitPriceCents,
      currency: input.currency,
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.serviceItems.set(item.id, item);
    return item;
  }

  async createOrder(tenantId: string, input: CreateOrderInput): Promise<Order> {
    const now = new Date().toISOString();
    const orderId = randomUUID();
    const items: OrderItem[] = [];
    for (const line of input.items) {
      const catalog = await this.getServiceItem(tenantId, line.serviceItemId);
      if (!catalog) throw new Error(`Service item not found: ${line.serviceItemId}`);
      if (catalog.status !== 'active') throw new Error(`Service item not active: ${catalog.sku}`);
      items.push({
        id: randomUUID(),
        tenantId,
        orderId,
        serviceItemId: catalog.id,
        sku: catalog.sku,
        name: catalog.name,
        quantity: line.quantity,
        unitPriceCents: catalog.unitPriceCents,
        lineTotalCents: catalog.unitPriceCents * line.quantity,
        createdAt: now,
      });
    }
    const totalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const order: Order = {
      id: orderId,
      tenantId,
      contactId: input.contactId ?? null,
      externalOrderId: input.externalOrderId ?? null,
      status: 'open',
      currency: input.currency ?? 'IDR',
      totalCents,
      channelId: input.channelId ?? null,
      campaignId: input.campaignId ?? null,
      conversationId: input.conversationId ?? null,
      agentId: input.agentId ?? null,
      placedAt: now,
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
      items,
    };
    this.orders.set(orderId, order);
    this.orderItems.set(orderId, items);
    return order;
  }

  async getOrder(tenantId: string, id: string): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order || order.tenantId !== tenantId) return null;
    return { ...order, items: this.orderItems.get(id) ?? [] };
  }

  async listOrders(tenantId: string): Promise<Order[]> {
    return [...this.orders.values()].filter((o) => o.tenantId === tenantId).map((o) => ({ ...o, items: this.orderItems.get(o.id) ?? [] }));
  }

  async createInvoice(
    tenantId: string,
    orderId: string,
    input?: { dueAt?: string; externalInvoiceNumber?: string },
  ): Promise<Invoice> {
    const order = await this.getOrder(tenantId, orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    const now = new Date().toISOString();
    const invoice: Invoice = {
      id: randomUUID(),
      tenantId,
      orderId,
      externalInvoiceNumber: input?.externalInvoiceNumber ?? null,
      status: 'issued',
      totalCents: order.totalCents,
      currency: order.currency,
      paymentLink: null,
      issuedAt: now,
      dueAt: input?.dueAt ?? null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async getInvoice(tenantId: string, id: string): Promise<Invoice | null> {
    const inv = this.invoices.get(id);
    return inv && inv.tenantId === tenantId ? inv : null;
  }

  async getInvoiceByOrder(tenantId: string, orderId: string): Promise<Invoice | null> {
    const inv = [...this.invoices.values()].find((i) => i.tenantId === tenantId && i.orderId === orderId);
    return inv ?? null;
  }

  async markInvoicePaid(tenantId: string, id: string): Promise<Invoice> {
    const inv = this.invoices.get(id);
    if (!inv || inv.tenantId !== tenantId) throw new Error(`Invoice not found: ${id}`);
    const updated: Invoice = {
      ...inv,
      status: 'paid',
      paidAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.invoices.set(id, updated);
    return updated;
  }
}
