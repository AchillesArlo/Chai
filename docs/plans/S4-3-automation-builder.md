# S4-3 Visual Automation Builder (FUL-03)

Stage 4, Workstream S4-3. Visual automation builder with simulation, versioning, and approval workflow.

## Scope

Owners design message-triggered automation flows (trigger → condition → action) in a visual builder, dry-run them against sample input, version them on publish, and move them through a DRAFT → PENDING_APPROVAL → ACTIVE → ARCHIVED lifecycle.

## Components

### Database (`packages/database/migrations/0015_automation_builder.sql`)
- `chai.automation_flow` — flow definition, status, version, tenant-scoped.
- `chai.automation_flow_version` — immutable published snapshots with change_log.
- `chai.automation_simulation` — recorded dry-run inputs/outputs.
- RLS policies + grants to `chai_app_runtime`, `chai_worker_runtime` (pattern from 0009_knowledge.sql).

### Domain (`packages/domain/src/automation/`)
- `flow-types.ts` — `TriggerNode`, `ActionNode`, `ConditionNode`, `FlowDefinition`, `FlowExecutionContext`, `FlowExecutionResult`.
- `flow-engine.ts` — pure `executeFlow(definition, context, handlers)` returning an execution trace; supports conditions branching via edge labels.
- `simulation.ts` — `simulateFlow(definition, input, handlers, options)` dry-run wrapper.
- `versioning.ts` — `createVersion`, `publishVersion`, `listVersions` over `withTenantTransaction`.
- `library/triggers.ts` — `onMessageReceived`, `onLeadCreated`, `onPaymentReceived`, `onShipmentDelivered`.
- `library/actions.ts` — `sendMessage`, `createLead`, `scheduleFollowUp`, `notifyAgent`, `updateStatus`.
- `library/conditions.ts` — `checkKeyword`, `checkTime`, `checkTenantAttribute`.

### API (`apps/api/src/modules/automation-builder/`)
Factory swap between InMemory (tests/local) and Postgres (runtime). Controller is `@RequireAudience('client-portal')`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/client/v1/automation/flows` | List flows for tenant |
| POST | `/api/client/v1/automation/flows` | Create draft |
| PUT | `/api/client/v1/automation/flows/:id` | Update draft |
| POST | `/api/client/v1/automation/flows/:id/simulate` | Dry-run against sample input |
| POST | `/api/client/v1/automation/flows/:id/publish` | Version + activate |
| GET | `/api/client/v1/automation/flows/:id/versions` | Version history |

### Owner Console (`apps/owner-console/src/app/automation/`)
- `page.tsx` — flow list with create/edit links.
- `builder/page.tsx` — visual editor composing palette, canvas, simulation, version history.
- `components/automation/FlowCanvas.tsx` — nodes rendered as styled divs.
- `components/automation/NodePalette.tsx` — trigger/action/condition sidebar.
- `components/automation/SimulationPanel.tsx` — input + run + trace output.
- `components/automation/VersionHistory.tsx` — published version list.
- `types/automation.ts` — local types (no @chai/domain import).

## Design Decisions
- **No react-flow / no new deps.** Nodes are plain divs; the canvas is a vertical stack. Sufficient for the editor; upgrade to a graph library only if layout complexity demands it.
- **Pure engine, pluggable handlers.** `executeFlow` takes a `FlowEngineHandlers` map so the API can wire real side effects while simulation uses deterministic stubs.
- **Versioning is append-only.** Each publish writes a new `automation_flow_version` row; the flow row's `version` + `status` are updated atomically inside `withTenantTransaction`.

## Tests
- `flow-engine.test.ts` — trigger + condition + action execution.
- `simulation.test.ts` — dry-run returns trace, SKIPPED when trigger mismatched.
- `automation-builder.integration.test.ts` — Postgres repo: create, simulate, publish, list versions, tenant isolation under RLS.
