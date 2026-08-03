# Payment Reconciliation & Discrepancy Runbook (REQ-17-065)

## 1. Overview
Documented operational runbook for handling payment reconciliation discrepancies, aging, assignment, resolution, and audit trail in accordance with Blueprint 05 §11.7 (REQ-17-065).

When an external payment provider reports an unmapped status (`UNKNOWN_RESULT`), status mismatch, or amount discrepancy, the system records an open entry in `chai.payment_reconciliation`. Operational teams inspect, assign, and resolve discrepancies while recording audit entries and outbox events.

---

## 2. Table Schema (`chai.payment_reconciliation`)

- `id`: UUID (Primary Key)
- `tenant_id`: Tenant scope (`chai.tenant(id)`)
- `payment_id`: Associated payment ID (`chai.payment(id)`)
- `provider`: Provider identifier (e.g., `'mock-payment'`, `'midtrans'`)
- `external_id`: External checkout / transaction reference
- `discrepancy_type`: Category of discrepancy (`'UNKNOWN_RESULT'`, `'STATUS_MISMATCH'`, `'AMOUNT_MISMATCH'`, `'UNMATCHED_SETTLEMENT'`)
- `local_status` / `provider_status`: Snapshot of local vs provider payment status
- `local_amount_cents` / `provider_amount_cents`: Snapshot of local vs provider amounts
- `assigned_owner_id`: Operator assigned to resolve the discrepancy
- `aging_days`: Number of days discrepancy has remained unresolved
- `status`: `'OPEN'`, `'INVESTIGATING'`, `'RESOLVED'`, `'IGNORED'`
- `resolution_notes`: Mandatory rationale provided upon resolution

---

## 3. Operational Triage & Resolution Workflow

1. **Inspection**:
   - Query open reconciliation items:
     `GET /api/client/v1/payments/reconciliations`
   - Filter by `status = 'OPEN'` and sort by `aging_days DESC`.

2. **Investigation & Assignment**:
   - Verify provider dashboard / logs for `external_id`.
   - Update status to `'INVESTIGATING'` and assign operator (`assigned_owner_id`).

3. **Resolution**:
   - Execute resolution endpoint:
     `POST /api/client/v1/payments/reconciliations/:id/resolve`
     Body: `{ "notes": "Confirmed manual bank transfer settled; matched with bank statement #1234" }`
   - Requiring `RECENT_AUTH_REQUIRED` re-authentication (ADR-029).
   - Writes `audit_log` entry (`action: 'payment.reconciliation_resolved'`) and emits `outbox_event` (`payment.reconciliation_resolved`).

---

## 4. Verification Checklist

- [x] Reconciliation table schema with RLS enforcement (`0090_payment_reconciliation.sql`)
- [x] Operational API endpoints for listing and resolving reconciliations
- [x] Re-authentication guard (`assertRecentAuthentication`) on resolution endpoint
- [x] Atomic audit trail and outbox event on resolution
