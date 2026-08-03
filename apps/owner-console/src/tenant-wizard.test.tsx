import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { TenantWizard, WIZARD_DRAFT_STORAGE_KEY, WIZARD_STEPS } from './tenant-wizard';

describe('TenantWizard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows all eight steps and starts on Identitas', () => {
    render(<TenantWizard />);
    for (const label of WIZARD_STEPS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText('Nama organisasi *')).toBeVisible();
  });

  it('autosaves the draft after a step advance', () => {
    render(<TenantWizard />);
    fireEvent.change(screen.getByLabelText('Nama organisasi *'), {
      target: { value: 'Acme Klinik' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    const raw = window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw ?? '').toContain('Acme Klinik');
    expect(screen.getByText('Tersimpan otomatis')).toBeVisible();
  });

  it('creates a DRAFT tenant and refuses activation until the checklist is complete', () => {
    render(<TenantWizard />);
    for (let i = 0; i < WIZARD_STEPS.length - 1; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Buat draf tenant' }));

    expect(screen.getByText('DRAFT')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aktifkan tenant' })).toBeDisabled();

    // Complete every onboarding item.
    for (const checkbox of screen.getAllByRole('checkbox')) {
      fireEvent.click(checkbox);
    }

    const activate = screen.getByRole('button', { name: 'Aktifkan tenant' });
    expect(activate).toBeEnabled();
    fireEvent.click(activate);
    expect(screen.getByText('ACTIVE')).toBeVisible();
  });
});
