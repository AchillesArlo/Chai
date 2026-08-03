import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AITraceSummary,
  ApprovalCard,
  CostTokenSummary,
  EvidenceIndicator,
  GuardrailEvent,
  ModelAliasBadge,
  PromptVersionChip,
  SourceCitationList,
  ToolProposalCard,
  type EvidenceLevel,
} from './ai';

describe('EvidenceIndicator (no numeric confidence)', () => {
  const levels: EvidenceLevel[] = ['strong', 'partial', 'none', 'human-review'];

  it('renders a qualitative label for every level', () => {
    render(
      <div>
        <EvidenceIndicator level="strong" />
        <EvidenceIndicator level="partial" />
        <EvidenceIndicator level="none" />
        <EvidenceIndicator level="human-review" />
      </div>,
    );
    expect(screen.getByText('Strong evidence')).toBeVisible();
    expect(screen.getByText('Partial evidence')).toBeVisible();
    expect(screen.getByText('No approved evidence')).toBeVisible();
    expect(screen.getByText('Human review required')).toBeVisible();
  });

  it('never renders a percentage for any level', () => {
    for (const level of levels) {
      const { container, unmount } = render(<EvidenceIndicator level={level} />);
      expect(container.textContent ?? '').not.toMatch(/%|\bpercent\b|\bconfidence\b/i);
      expect(container.textContent ?? '').not.toMatch(/\d/);
      unmount();
    }
  });

  it('exposes the level via a data attribute for styling/tests', () => {
    render(<EvidenceIndicator level="strong" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-evidence-level', 'strong');
  });
});

describe('ModelAliasBadge', () => {
  it('shows the logical alias and hides the deployment behind a tooltip', () => {
    render(<ModelAliasBadge alias="cs-fast" deployment="gpt-4o-mini-2024" />);
    expect(screen.getByText('cs-fast')).toBeVisible();
    expect(screen.getByTitle('Deployment: gpt-4o-mini-2024')).toBeInTheDocument();
    expect(screen.queryByText('gpt-4o-mini-2024')).not.toBeInTheDocument();
  });
});

describe('SourceCitationList', () => {
  const citations = [
    { id: 'a', source: 'kb://faq/1', title: 'Kebijakan refund' },
    { id: 'b', title: 'Jam operasional' },
  ];

  it('renders an ordered list of citations', () => {
    render(<SourceCitationList citations={citations} />);
    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getByText('Kebijakan refund')).toBeVisible();
    expect(screen.getByText('kb://faq/1')).toBeVisible();
  });

  it('shows an empty state when there are no citations', () => {
    render(<SourceCitationList citations={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Tidak ada sumber');
  });

  it('activates a citation via keyboard focus + click when selectable', () => {
    const onSelect = vi.fn();
    render(<SourceCitationList citations={citations} onSelect={onSelect} />);
    const first = screen.getByRole('button', { name: /Kebijakan refund/ });
    first.focus();
    expect(first).toHaveFocus();
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});

describe('ToolProposalCard', () => {
  it('renders the tool name and argument summary', () => {
    render(
      <ToolProposalCard
        args={[{ label: 'order_id', value: 'ORD-42' }]}
        evidence="partial"
        toolName="issue_refund"
      />,
    );
    expect(screen.getByText('issue_refund')).toBeVisible();
    expect(screen.getByText('ORD-42')).toBeVisible();
    expect(screen.getByText('Partial evidence')).toBeVisible();
  });

  it('routes approve and reject actions', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ToolProposalCard onApprove={onApprove} onReject={onReject} toolName="send_message" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tolak' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('gates behind ApprovalButton when an approver is required', () => {
    render(
      <ToolProposalCard approver="Supervisor" risk="mutasi uang" toolName="issue_refund" />,
    );
    expect(screen.getByText('Supervisor')).toBeVisible();
  });
});

describe('ApprovalCard', () => {
  it('renders the decision context and approves on click', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalCard
        approver="Kepala Operasi"
        onApprove={onApprove}
        reason="Refund melebihi ambang otomatis"
        risk="Rp 2jt"
        title="Refund manual"
      />,
    );
    expect(screen.getByText('Refund manual')).toBeVisible();
    expect(screen.getByText('Refund melebihi ambang otomatis')).toBeVisible();
    const approve = screen.getByRole('button', { name: 'Setujui' });
    approve.focus();
    expect(approve).toHaveFocus();
    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});

describe('PromptVersionChip', () => {
  it('renders a static chip by default', () => {
    render(<PromptVersionChip status="published" version="v12" />);
    expect(screen.getByText('v12')).toBeVisible();
    expect(screen.getByText(/terbit/)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('becomes a focusable button when interactive', () => {
    const onClick = vi.fn();
    render(<PromptVersionChip onClick={onClick} version="v13" />);
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('AITraceSummary', () => {
  const steps = [
    { id: '1', label: 'Retrieve knowledge' },
    { id: '2', detail: 'router: cs-fast', label: 'Route to model' },
  ];

  it('is collapsed by default and toggles open via the button', () => {
    render(<AITraceSummary latencyMs={820} steps={steps} />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Retrieve knowledge')).not.toBeInTheDocument();

    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Retrieve knowledge')).toBeVisible();
    expect(screen.getByText('router: cs-fast')).toBeVisible();
  });
});

describe('CostTokenSummary', () => {
  it('renders token counts and a money amount, never a percentage', () => {
    const { container } = render(
      <CostTokenSummary
        costCurrency="IDR"
        costMinor={125000}
        inputTokens={1200}
        locale="en-US"
        outputTokens={340}
      />,
    );
    expect(screen.getByText('1,200')).toBeVisible();
    expect(screen.getByText('340')).toBeVisible();
    expect(container.textContent ?? '').not.toContain('%');
  });
});

describe('GuardrailEvent', () => {
  it('renders severity and rule, and toggles detail via keyboard focus', () => {
    render(
      <GuardrailEvent
        detail="Nomor kartu terdeteksi pada keluaran model."
        rule="pii_redaction"
        severity="blocked"
        summary="Keluaran diblokir sebelum dikirim."
      />,
    );
    expect(screen.getByText(/Diblokir/)).toBeVisible();
    expect(screen.getByText('pii_redaction')).toBeVisible();
    const toggle = screen.getByRole('button', { name: 'Lihat detail' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Nomor kartu terdeteksi/)).toBeVisible();
  });
});
