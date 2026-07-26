# Design System Specification

## 1. Design Direction

Karakter visual:

- trustworthy;
- operational;
- modern but not playful;
- high information density without visual noise;
- clear separation between AI suggestion, verified business data, and human action.

Default theme: light. Token architecture harus memungkinkan dark mode kemudian tanpa mengubah components.

## 2. Foundations

### 2.1 Color tokens

| Token | Default | Use |
|---|---|---|
| brand-600 | #4F46E5 | Primary action |
| brand-700 | #4338CA | Hover/active |
| brand-50 | #EEF2FF | Subtle brand surface |
| neutral-950 | #0F172A | Primary text |
| neutral-700 | #334155 | Secondary strong text |
| neutral-500 | #64748B | Muted text |
| neutral-300 | #CBD5E1 | Border strong |
| neutral-200 | #E2E8F0 | Border |
| neutral-100 | #F1F5F9 | Subtle surface |
| neutral-50 | #F8FAFC | App background |
| surface | #FFFFFF | Card/panel |
| success-600 | #16A34A | Success |
| warning-600 | #D97706 | Warning |
| danger-600 | #DC2626 | Destructive/error |
| info-600 | #2563EB | Information |

Semantic tokens, bukan raw palette, dipakai component:

- bg-default, bg-subtle, bg-elevated;
- text-primary, text-secondary, text-muted, text-inverse;
- border-default, border-strong, border-focus;
- action-primary, action-secondary, action-danger;
- status-success, status-warning, status-danger, status-info.

### 2.2 Typography

Default font: Inter dengan system fallback.

| Style | Size/line | Weight | Use |
|---|---|---:|---|
| display | 36/44 | 700 | Rare marketing/empty state |
| h1 | 30/38 | 700 | Page title |
| h2 | 24/32 | 650 | Major section |
| h3 | 20/28 | 600 | Card/section |
| body-lg | 16/24 | 400 | Explanatory copy |
| body | 14/20 | 400 | Default UI |
| body-medium | 14/20 | 500 | Emphasis |
| caption | 12/16 | 400 | Metadata |
| mono | 13/20 | 400 | ID, trace, technical value |

### 2.3 Spacing

Base unit 4 px.

Allowed scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

### 2.4 Radius

- small 6 px: inputs/chips;
- medium 10 px: cards/dialog controls;
- large 14 px: major panels;
- full: avatar/status pill.

### 2.5 Elevation

- level 0: page;
- level 1: card;
- level 2: dropdown/sticky element;
- level 3: dialog/drawer.

Use borders before shadows for dense operational screens.

## 3. Layout

### Breakpoints

| Name | Width | Behavior |
|---|---:|---|
| sm | 640 | Mobile landscape |
| md | 768 | Tablet |
| lg | 1024 | Desktop navigation |
| xl | 1280 | Three-pane inbox |
| 2xl | 1536 | Wide analytics |

### Grid

- Page gutter: 16 mobile, 24 tablet, 32 desktop.
- Forms max width: 720 px.
- Narrative/settings pages max width: 960 px.
- Tables/inbox/analytics: fluid.
- Card grid: minimum 260 px per card.

## 4. Core Components

### 4.1 Navigation

- AppSidebar
- SidebarGroup
- TopBar
- TenantSwitcher
- Breadcrumb
- MobileBottomNav
- CommandSearch

TenantSwitcher:

- owner version can search all tenants;
- client version lists memberships only;
- selected tenant shown persistently;
- destructive owner actions repeat tenant name in confirmation.

### 4.2 Actions

- Button: primary, secondary, ghost, danger, link.
- IconButton requires tooltip and accessible label.
- SplitButton for action with safe alternatives.
- ApprovalButton displays required approver/risk.

Only one primary button per local decision area.

### 4.3 Forms

- TextField
- TextArea
- Select/Combobox
- MultiSelect
- Date/Time/Timezone picker
- Phone/ChannelIdentity input
- FileUploader
- SecretInput
- PolicyBuilder
- FormSection
- InlineValidation

SecretInput never supports reveal after initial save. Rotation creates new credential version.

### 4.4 Data display

- MetricCard
- DataTable
- FilterBar
- SavedView
- KeyValueList
- Timeline
- AuditEvent
- HealthMatrix
- EmptyState
- DataFreshness
- CostBadge

DataTable requirements:

- server pagination;
- sortable columns;
- filter chips;
- column visibility;
- sticky header;
- keyboard row navigation;
- accessible mobile card fallback;
- export permission separate from view.

### 4.5 Status components

Standard status language:

| Domain | Values |
|---|---|
| Tenant | Draft, Active, Suspended, Pending deletion |
| Conversation | Open, Waiting, Human active, Resolved |
| Channel | Connected, Degraded, Reauth required, Blocked, Disabled |
| Knowledge | Draft, Processing, Review, Published, Failed, Expired |
| Workflow | Scheduled, Running, Waiting, Completed, Failed, Cancelled |
| Action | Proposed, Needs confirmation, Needs approval, Executing, Succeeded, Failed |
| Payment | Draft, Waiting for payment, Processing, Paid, Expired, Failed, Cancelled, Partially refunded, Refunded, Disputed |
| Shipment | Created, Awaiting pickup, Picked up, In transit, Out for delivery, Delivered, On hold, Delivery failed, Returning, Returned, Lost, Cancelled, Unknown |
| Reconciliation | Current, Pending, Mismatch, Stale, Failed |

Status badge always includes text and optional icon.

### 4.6 Feedback

- InlineAlert for persistent context.
- Toast for transient success.
- Banner for global/tenant incident.
- Progress for multi-step work.
- Skeleton for loading.
- ErrorBlock with correlation ID.

### 4.7 Overlays

- Dialog: short decision.
- Drawer: contextual detail/filter.
- FullScreenFlow: complex onboarding/editor.
- Popover: lightweight details.

Nested dialogs are prohibited.

## 5. Conversation Components

- ConversationListItem
- MessageBubble
- InternalNoteBubble
- AIAnswerEvidence
- DeliveryStatus
- AttachmentPreview
- Composer
- SuggestedReply
- TakeoverBanner
- SLAIndicator
- CustomerContextPanel
- ToolActionCard
- PaymentRequestCard
- ShipmentStatusCard
- TrackingTimeline
- DeliveryExceptionCard

Visual distinctions:

- inbound customer: neutral left;
- outbound AI: brand-subtle right + AI label;
- outbound human: surface right + agent avatar/name;
- internal note: warning-subtle, never resembles outbound;
- failed message: danger border + retry state;
- tool action: structured card, not chat bubble.

## 6. AI-Specific Components

- ModelAliasBadge
- Confidence/EvidenceIndicator
- SourceCitationList
- ToolProposalCard
- ApprovalCard
- PromptVersionChip
- AITraceSummary
- CostTokenSummary
- GuardrailEvent

Avoid displaying a single pseudo-scientific confidence percentage unless model/evaluation semantics support it. Prefer:

- strong evidence;
- partial evidence;
- no approved evidence;
- human review required.

## 7. Analytics Components

### Charts

- Line: time trend.
- Bar: categorical comparison.
- Stacked bar/area: bot vs human composition.
- Funnel: lead/booking journey.
- Heatmap: hour/day workload.
- Table: exact values and audit.

Rules:

- chart has title, question, unit, timezone, freshness;
- comparison period explicit;
- no dual axis by default;
- colors stable across pages;
- bot/human/blended always same semantic colors;
- zero and missing data distinguished;
- downloadable table alternative.

Suggested series colors:

- AI automated: brand-600;
- human: info-600;
- blended: violet;
- success/outcome: success-600;
- failure: danger-600;
- comparison: neutral-400.

## 8. Forms and Validation

- Validate on blur and submit; avoid error on untouched field.
- Error text says how to fix.
- Server error maps to field where possible.
- Preserve values after retryable failure.
- Unsaved change guard on complex settings.
- Publish action shows diff summary.
- Timezone appears beside every scheduling input.
- Destructive form separates impact preview from confirmation.

## 9. Content Design

Voice:

- direct;
- calm;
- transparent;
- non-technical for client;
- precise for owner operations.

Preferred:

- “Koneksi perlu dihubungkan ulang.”
- “Data terakhir diperbarui 12 menit lalu.”
- “AI tidak menemukan sumber yang cukup dan mengalihkan percakapan.”

Avoid:

- “Something went wrong.”
- “AI confidence 37%” tanpa definisi.
- “Free WhatsApp API.”
- “Guaranteed anti-ban.”

## 10. Iconography and Media

- Icon set: Lucide or equivalent consistent outline set.
- Icon is supplemental, not sole label.
- Channel logos may use official brand asset rules.
- Customer/avatar fallback uses initials with deterministic color.
- Attachment thumbnail never auto-executes active content.

## 11. Motion

- 120–180 ms for hover/small transition.
- 180–240 ms for drawer/dialog.
- No decorative motion on dense pages.
- Respect prefers-reduced-motion.
- Incoming message may use subtle highlight, not movement that shifts layout.

## 12. Accessibility Component Contract

Every component documents:

- semantic role;
- keyboard behavior;
- focus behavior;
- label/description;
- error association;
- high contrast;
- screen reader announcement;
- reduced motion behavior.

Critical keyboard patterns:

- inbox list: arrow navigation, Enter open;
- tabs: arrow keys;
- dialog: trapped focus and return;
- combobox: standard ARIA behavior;
- table: navigable controls without making every cell a tab stop.

## 13. Design QA Checklist

- Token-only colors/spacing in product components.
- 320 px mobile critical flow works.
- 200% zoom usable.
- Light theme contrast passes.
- Long Indonesian/English labels tested.
- Empty, loading, partial, stale, and error states designed.
- Owner/client surfaces are visually distinguishable.
- Risk and unofficial provider states are explicit.
- Chart includes data table or accessible summary.
- Component behavior matches API permission/error contract.

## 14. Payment and Logistics Components

Required payment components:

- MoneyAmount: locale-aware amount/currency with minor-unit-safe input contract;
- PaymentStatusBadge: status text, event source, and verified timestamp;
- PaymentTimeline: request, link, attempts, provider events, and reconciliation;
- PaymentLinkSummary: merchant, purpose, amount, currency, expiry, and copy/send action;
- ReconciliationBanner: stale/mismatch/uncertain result with safe next action;
- RefundApprovalCard: amount, reason, eligibility, approvers, recent-auth, and impact.

Required logistics components:

- ShipmentStatusBadge;
- TrackingTimeline with milestone time/source and accessible ordered-list fallback;
- EtaCommitment with provider/source/freshness and no value when unavailable;
- PackageItemSummary for partial/multi-parcel fulfillment;
- ShipmentExceptionCard with severity, age, owner, and next action;
- ProofOfDeliveryAccess with masked preview, permission explanation, and audit notice.

Rules:

- Never use a green `Paid` state before verified provider evidence.
- Redirect success, screenshot, and customer claim use neutral `Awaiting verification` copy.
- Money never relies on floating-point UI calculations; server response remains authoritative.
- Shipment color is supplemental; icon and text communicate every state.
- `Unknown`, `Stale`, and `Mismatch` are first-class states, not generic errors.
- Provider/source and last-updated time appear beside externally sourced status.
- Full address, bank reference, payment token, and proof-of-delivery content are masked by default.
- High/critical mutation dialogs show amount/cost, object, provider, irreversible impact, approval, and idempotency-safe progress.
- A submitted mutation remains in `Processing/Reconciliation` when the external result is uncertain; the UI must not invite an immediate duplicate retry.
