// Shared kernel: the actions module executes tools that touch other modules'
// aggregates (knowledge, payments, logistics, leads). Each port below is the
// minimal surface a tool executor needs — never the owning module's full
// repository — so actions never imports another module's repository
// directly (eslint import-boundary rule, 02 §5, GAP-009). Implementations
// live in the owning module and are exported as the port's DI token.

export interface ActionKnowledgeSearchResult {
  citation: { documentId: string; knowledgeBaseId: string; excerpt: string };
  score: number;
}

export abstract class ActionKnowledgePort {
  abstract search(
    tenantId: string,
    query: string,
    knowledgeBaseIds: string[],
  ): Promise<ActionKnowledgeSearchResult[]>;
}

export interface ActionPaymentStatus {
  amount: number;
  currency: string;
  externalId: string;
  status: string;
}

export abstract class ActionPaymentPort {
  abstract getStatus(
    tenantId: string,
    externalId: string,
  ): Promise<ActionPaymentStatus | null>;
}

export interface ActionShipmentStatus {
  carrier: string;
  status: string;
  timeline: Array<{ at: string; code: string; description: string }>;
  trackingNumber: string;
}

export abstract class ActionShipmentPort {
  abstract getStatus(
    tenantId: string,
    trackingNumber: string,
    proof: { contactId?: string; orderReference?: string },
  ): Promise<ActionShipmentStatus | null>;
}

export interface ActionAppointmentInput {
  contactId: string;
  endsAt: string;
  idempotencyKey: string;
  resourceId: string;
  startsAt: string;
  title: string;
}

export interface ActionAppointmentResult {
  appointment: { id: string; startsAt: string; endsAt: string };
  conflict: boolean;
}

export abstract class ActionAppointmentPort {
  abstract create(
    tenantId: string,
    input: ActionAppointmentInput,
  ): Promise<ActionAppointmentResult>;
}

// FASE 6 — the payments module needs to resolve a checkout amount from an
// order/invoice it does not own. This port exposes only the read shape
// PaymentsController needs, never OrderRepository's full surface.
export interface OrderAmountRef {
  currency: string;
  invoiceId?: string;
  invoiceStatus?: string;
  orderId?: string;
  totalCents: number;
}

export abstract class PaymentOrderPort {
  abstract getInvoiceAmount(
    tenantId: string,
    invoiceId: string,
  ): Promise<OrderAmountRef | null>;

  abstract getOrderAmount(
    tenantId: string,
    orderId: string,
  ): Promise<OrderAmountRef | null>;

  abstract markInvoicePaid(tenantId: string, invoiceId: string): Promise<void>;
}

export interface PaymentNotificationInput {
  message: string;
  title: string;
}

export abstract class PaymentNotificationPort {
  abstract notify(tenantId: string, input: PaymentNotificationInput): Promise<void>;
}
