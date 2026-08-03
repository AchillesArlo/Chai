import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalButton, Button, IconButton, SplitButton } from './actions';

describe('Button', () => {
  it('renders children and defaults to type=button', () => {
    render(<Button>Simpan</Button>);
    const button = screen.getByRole('button', { name: 'Simpan' });
    expect(button).toBeVisible();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies the requested variant styling', () => {
    render(<Button variant="danger">Hapus</Button>);
    expect(screen.getByRole('button', { name: 'Hapus' }).className).toContain('bg-red-600');
  });

  it('is focusable and activates via click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Kirim</Button>);
    const button = screen.getByRole('button', { name: 'Kirim' });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and marks aria-busy while loading', () => {
    render(<Button loading>Memproses</Button>);
    const button = screen.getByRole('button', { name: 'Memproses' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('IconButton', () => {
  it('exposes an accessible label and a tooltip', () => {
    render(<IconButton icon={<svg />} label="Segarkan" />);
    const button = screen.getByRole('button', { name: 'Segarkan' });
    expect(button).toHaveAttribute('title', 'Segarkan');
  });

  it('is reachable by keyboard focus', () => {
    render(<IconButton icon={<svg />} label="Tutup" tooltip="Tutup panel" />);
    const button = screen.getByRole('button', { name: 'Tutup' });
    button.focus();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('title', 'Tutup panel');
  });
});

describe('SplitButton', () => {
  const actions = [
    { label: 'Simpan sebagai draf', onClick: vi.fn() },
    { label: 'Simpan dan tutup', onClick: vi.fn() },
  ];

  it('runs the primary action on click', () => {
    const onPrimary = vi.fn();
    render(<SplitButton actions={actions} onPrimary={onPrimary} primaryLabel="Simpan" />);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('opens the menu with ArrowDown and exposes menu semantics', () => {
    render(<SplitButton actions={actions} onPrimary={vi.fn()} primaryLabel="Simpan" />);
    const toggle = screen.getByRole('button', { name: 'More actions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(toggle, { key: 'ArrowDown' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('moves focus with arrow keys and activates an item with click', () => {
    const onClick = vi.fn();
    const items = [
      { label: 'Alternatif A', onClick: vi.fn() },
      { label: 'Alternatif B', onClick },
    ];
    render(<SplitButton actions={items} onPrimary={vi.fn()} primaryLabel="Aksi" />);
    const toggle = screen.getByRole('button', { name: 'More actions' });
    fireEvent.keyDown(toggle, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    const first = screen.getByRole('menuitem', { name: 'Alternatif A' });
    const second = screen.getByRole('menuitem', { name: 'Alternatif B' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.click(second);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the toggle', () => {
    render(<SplitButton actions={actions} onPrimary={vi.fn()} primaryLabel="Simpan" />);
    const toggle = screen.getByRole('button', { name: 'More actions' });
    fireEvent.keyDown(toggle, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
});

describe('ApprovalButton', () => {
  it('always shows the required approver', () => {
    render(<ApprovalButton approver="Kepala Operasi" label="Setujui refund" risk="Rp 5jt" />);
    expect(screen.getByText('Kepala Operasi')).toBeVisible();
    expect(screen.getByText(/Rp 5jt/)).toBeVisible();
  });

  it('requests approval on activation when ready', () => {
    const onRequest = vi.fn();
    render(<ApprovalButton approver="Manajer" label="Setujui" onRequest={onRequest} />);
    const button = screen.getByRole('button', { name: 'Setujui' });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('disables the control while awaiting approval', () => {
    render(<ApprovalButton approver="Manajer" label="Setujui" state="awaiting-approval" />);
    const button = screen.getByRole('button', { name: /Menunggu persetujuan Manajer/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an approved status without an action button', () => {
    render(<ApprovalButton approver="Manajer" label="Setujui" state="approved" />);
    expect(screen.getByRole('status')).toHaveTextContent('Disetujui oleh Manajer');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
