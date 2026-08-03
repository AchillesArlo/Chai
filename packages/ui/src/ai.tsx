'use client';

import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  DollarSign,
  FileText,
  Info,
  ShieldCheck,
  Tag,
  UserCheck,
  Workflow,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { ApprovalButton, Button, type ApprovalState } from './actions';
import { MoneyAmount } from './money-and-timeline';

/**
 * AI-specific components (04_DESIGN_SYSTEM §6, REQ-04-016).
 *
 * Blueprint prohibition (§6, §9): **never render a single pseudo-scientific
 * confidence percentage.** Evidence is expressed with the qualitative levels the
 * blueprint defines — strong / partial / none / human-review — because a bare
 * "AI confidence 37%" implies a calibrated probability the model does not
 * actually produce. There is deliberately no numeric-percent prop anywhere in
 * this file.
 */

// ── 1. ModelAliasBadge ──────────────────────────────────────────────────────
// Shows the logical alias operators reason about; the physical deployment is
// internal detail, exposed only as a tooltip, never as the primary label.

export interface ModelAliasBadgeProps {
  alias: string;
  deployment?: string;
}

export function ModelAliasBadge({ alias, deployment }: ModelAliasBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200"
      title={deployment ? `Deployment: ${deployment}` : undefined}
    >
      <Cpu aria-hidden="true" className="size-3.5" />
      {alias}
    </span>
  );
}

// ── 2. EvidenceIndicator ────────────────────────────────────────────────────
// Qualitative only. No percentage, ever.

export type EvidenceLevel = 'strong' | 'partial' | 'none' | 'human-review';

const EVIDENCE_META: Record<
  EvidenceLevel,
  { className: string; icon: ReactNode; label: string }
> = {
  none: {
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
    icon: <AlertTriangle aria-hidden="true" className="size-3.5" />,
    label: 'No approved evidence',
  },
  partial: {
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    icon: <Info aria-hidden="true" className="size-3.5" />,
    label: 'Partial evidence',
  },
  strong: {
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    icon: <ShieldCheck aria-hidden="true" className="size-3.5" />,
    label: 'Strong evidence',
  },
  'human-review': {
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    icon: <UserCheck aria-hidden="true" className="size-3.5" />,
    label: 'Human review required',
  },
};

export interface EvidenceIndicatorProps {
  /** Optional override for the qualitative label; still never a percentage. */
  label?: string;
  level: EvidenceLevel;
}

export function EvidenceIndicator({ label, level }: EvidenceIndicatorProps) {
  const meta = EVIDENCE_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.className}`}
      data-evidence-level={level}
      role="status"
    >
      {meta.icon}
      {label ?? meta.label}
    </span>
  );
}

// ── 3. SourceCitationList ───────────────────────────────────────────────────

export interface SourceCitation {
  id: string;
  snippet?: string;
  source?: string;
  title: string;
}

export interface SourceCitationListProps {
  citations: readonly SourceCitation[];
  emptyLabel?: string;
  onSelect?: (id: string) => void;
}

export function SourceCitationList({
  citations,
  emptyLabel = 'Tidak ada sumber yang dikutip',
  onSelect,
}: SourceCitationListProps) {
  if (citations.length === 0) {
    return (
      <p className="text-sm text-slate-500" role="status">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ol aria-label="Sumber yang dikutip" className="space-y-2">
      {citations.map((citation, index) => {
        const inner = (
          <>
            <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
              <span className="tabular-nums text-slate-400">{index + 1}.</span>
              {citation.title}
            </span>
            {citation.source ? (
              <span className="mt-0.5 block font-mono text-xs text-slate-500">
                {citation.source}
              </span>
            ) : null}
            {citation.snippet ? (
              <span className="mt-1 block text-xs text-slate-600">{citation.snippet}</span>
            ) : null}
          </>
        );
        return (
          <li key={citation.id}>
            {onSelect ? (
              <button
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                onClick={() => onSelect(citation.id)}
                type="button"
              >
                {inner}
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 px-3 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── 4. ToolProposalCard ─────────────────────────────────────────────────────
// A proposed tool call awaiting a human decision. The policy engine is the only
// grantor of side-effects (README invariant); this card only surfaces the
// proposal and routes approve/reject back to the caller.

export interface ToolProposalArgument {
  label: string;
  value: string;
}

export interface ToolProposalCardProps {
  args?: readonly ToolProposalArgument[];
  evidence?: EvidenceLevel;
  onApprove?: () => void;
  onReject?: () => void;
  /** Approval gating from the policy engine, if the tool requires it. */
  approvalState?: ApprovalState;
  approver?: string;
  risk?: string;
  toolName: string;
}

export function ToolProposalCard({
  approvalState,
  approver,
  args = [],
  evidence,
  onApprove,
  onReject,
  risk,
  toolName,
}: ToolProposalCardProps) {
  return (
    <section
      aria-label={`Usulan tool: ${toolName}`}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Workflow aria-hidden="true" className="size-4 text-brand-600" />
          <h3 className="font-mono text-sm font-semibold text-slate-950">{toolName}</h3>
        </div>
        {evidence ? <EvidenceIndicator level={evidence} /> : null}
      </div>
      {args.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {args.map((arg) => (
            <div className="contents" key={arg.label}>
              <dt className="text-slate-500">{arg.label}</dt>
              <dd className="font-mono text-slate-800">{arg.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {approver ? (
          <ApprovalButton
            approver={approver}
            label="Setujui tool"
            onRequest={onApprove}
            risk={risk}
            size="sm"
            state={approvalState}
          />
        ) : (
          <Button onClick={onApprove} size="sm" variant="primary">
            Jalankan
          </Button>
        )}
        <Button onClick={onReject} size="sm" variant="secondary">
          Tolak
        </Button>
      </div>
    </section>
  );
}

// ── 5. ApprovalCard ─────────────────────────────────────────────────────────

export interface ApprovalCardProps {
  approver: string;
  onApprove?: () => void;
  onReject?: () => void;
  reason: string;
  risk?: string;
  state?: ApprovalState;
  title: string;
}

export function ApprovalCard({
  approver,
  onApprove,
  onReject,
  reason,
  risk,
  state = 'ready',
  title,
}: ApprovalCardProps) {
  return (
    <section
      aria-label={`Persetujuan: ${title}`}
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="size-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-amber-950">{title}</h3>
      </div>
      <p className="text-sm text-amber-900">{reason}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ApprovalButton
          approver={approver}
          label="Setujui"
          onRequest={onApprove}
          risk={risk}
          size="sm"
          state={state}
        />
        {state !== 'approved' ? (
          <Button onClick={onReject} size="sm" variant="secondary">
            Tolak
          </Button>
        ) : null}
      </div>
    </section>
  );
}

// ── 6. PromptVersionChip ────────────────────────────────────────────────────

export interface PromptVersionChipProps {
  onClick?: () => void;
  status?: 'published' | 'draft' | 'archived';
  version: string;
}

const PROMPT_STATUS_LABEL: Record<NonNullable<PromptVersionChipProps['status']>, string> = {
  archived: 'arsip',
  draft: 'draf',
  published: 'terbit',
};

export function PromptVersionChip({ onClick, status, version }: PromptVersionChipProps) {
  const content = (
    <>
      <Tag aria-hidden="true" className="size-3.5" />
      <span className="font-mono">{version}</span>
      {status ? <span className="text-slate-500">· {PROMPT_STATUS_LABEL[status]}</span> : null}
    </>
  );
  const className =
    'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200';
  if (onClick) {
    return (
      <button
        className={`${className} hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}

// ── 7. AITraceSummary ───────────────────────────────────────────────────────
// Expandable list of trace steps. Collapsed by default to keep dense screens
// quiet (04 §1); the toggle is a real button with aria-expanded.

export interface AITraceStep {
  detail?: string;
  id: string;
  label: string;
}

export interface AITraceSummaryProps {
  defaultOpen?: boolean;
  latencyMs?: number;
  steps: readonly AITraceStep[];
  title?: string;
}

export function AITraceSummary({
  defaultOpen = false,
  latencyMs,
  steps,
  title = 'Jejak eksekusi AI',
}: AITraceSummaryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Activity aria-hidden="true" className="size-4 text-brand-600" />
          {title}
          <span className="text-xs font-normal text-slate-500">
            ({steps.length} langkah{typeof latencyMs === 'number' ? ` · ${latencyMs} ms` : ''})
          </span>
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="size-4 text-slate-500" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 text-slate-500" />
        )}
      </button>
      {open ? (
        <ol className="space-y-2 border-t border-slate-100 px-4 py-3" id={panelId}>
          {steps.map((step, index) => (
            <li className="flex gap-3 text-sm" key={step.id}>
              <span className="tabular-nums text-slate-400">{index + 1}.</span>
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{step.label}</p>
                {step.detail ? <p className="text-xs text-slate-500">{step.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

// ── 8. CostTokenSummary ─────────────────────────────────────────────────────
// Token counts and money (minor units via MoneyAmount). Cost, not a percentage.

export interface CostTokenSummaryProps {
  costCurrency: string;
  /** Cost in the currency's smallest unit (money is always integer minor units). */
  costMinor: number;
  inputTokens: number;
  locale?: string;
  outputTokens: number;
}

export function CostTokenSummary({
  costCurrency,
  costMinor,
  inputTokens,
  locale,
  outputTokens,
}: CostTokenSummaryProps) {
  return (
    <dl
      aria-label="Ringkasan token dan biaya"
      className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
    >
      <div>
        <dt className="text-xs text-slate-500">Token masuk</dt>
        <dd className="font-mono tabular-nums text-slate-900">
          {inputTokens.toLocaleString(locale)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Token keluar</dt>
        <dd className="font-mono tabular-nums text-slate-900">
          {outputTokens.toLocaleString(locale)}
        </dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-xs text-slate-500">
          <DollarSign aria-hidden="true" className="size-3" />
          Biaya
        </dt>
        <dd className="font-semibold text-slate-900">
          <MoneyAmount amountMinor={costMinor} currency={costCurrency} locale={locale} />
        </dd>
      </div>
    </dl>
  );
}

// ── 9. GuardrailEvent ───────────────────────────────────────────────────────

export type GuardrailSeverity = 'info' | 'warning' | 'blocked';

const GUARDRAIL_META: Record<GuardrailSeverity, { className: string; label: string }> = {
  blocked: { className: 'border-red-200 bg-red-50 text-red-900', label: 'Diblokir' },
  info: { className: 'border-blue-200 bg-blue-50 text-blue-900', label: 'Info' },
  warning: { className: 'border-amber-200 bg-amber-50 text-amber-950', label: 'Peringatan' },
};

export interface GuardrailEventProps {
  detail?: string;
  rule: string;
  severity: GuardrailSeverity;
  summary: string;
}

export function GuardrailEvent({ detail, rule, severity, summary }: GuardrailEventProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const meta = GUARDRAIL_META[severity];
  return (
    <div className={`rounded-lg border p-3 text-sm ${meta.className}`} role="status">
      <div className="flex items-start gap-2">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {meta.label}: <span className="font-mono">{rule}</span>
          </p>
          <p className="mt-0.5 opacity-90">{summary}</p>
          {detail ? (
            <>
              <button
                aria-controls={panelId}
                aria-expanded={open}
                className="mt-1 text-xs font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                onClick={() => setOpen((v) => !v)}
                type="button"
              >
                {open ? 'Sembunyikan detail' : 'Lihat detail'}
              </button>
              {open ? (
                <p className="mt-1 text-xs opacity-80" id={panelId}>
                  {detail}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
