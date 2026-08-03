import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ONBOARDING_ITEMS,
  DEFAULT_ONBOARDING_MODULES,
  OnboardingChecklist,
  applicableOnboardingItems,
  isOnboardingComplete,
} from './onboarding-checklist';

describe('onboarding checklist logic', () => {
  it('excludes optional-module items when those modules are off', () => {
    const applicable = applicableOnboardingItems(
      DEFAULT_ONBOARDING_ITEMS,
      DEFAULT_ONBOARDING_MODULES,
    );
    expect(applicable.find((i) => i.id === 'payment-merchant')).toBeUndefined();
    expect(applicable.find((i) => i.id === 'shipping-provider')).toBeUndefined();
  });

  it('includes the payment item once the payment module is enabled', () => {
    const applicable = applicableOnboardingItems(DEFAULT_ONBOARDING_ITEMS, {
      payment: true,
      shipping: false,
    });
    expect(applicable.find((i) => i.id === 'payment-merchant')).toBeDefined();
  });

  it('is incomplete until every applicable item is done', () => {
    expect(isOnboardingComplete(DEFAULT_ONBOARDING_ITEMS, DEFAULT_ONBOARDING_MODULES)).toBe(false);
    const allDone = DEFAULT_ONBOARDING_ITEMS.map((i) => ({ ...i, done: true }));
    expect(isOnboardingComplete(allDone, DEFAULT_ONBOARDING_MODULES)).toBe(true);
  });

  it('stays incomplete when an enabled module has an unfinished item', () => {
    const coreDone = DEFAULT_ONBOARDING_ITEMS.map((i) => ({ ...i, done: !i.module }));
    expect(isOnboardingComplete(coreDone, { payment: true, shipping: false })).toBe(false);
  });
});

describe('OnboardingChecklist component', () => {
  it('renders applicable items and toggles via a keyboard-accessible checkbox', () => {
    const onToggle = vi.fn();
    render(
      <OnboardingChecklist
        items={DEFAULT_ONBOARDING_ITEMS}
        modules={DEFAULT_ONBOARDING_MODULES}
        onToggle={onToggle}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
    const first = screen.getByRole('checkbox', { name: 'Profil bisnis' });
    first.focus();
    expect(first).toHaveFocus();
    fireEvent.click(first);
    expect(onToggle).toHaveBeenCalledWith('business-profile', true);
  });

  it('announces completion state', () => {
    const allDone = DEFAULT_ONBOARDING_ITEMS.map((i) => ({ ...i, done: true }));
    render(<OnboardingChecklist items={allDone} modules={DEFAULT_ONBOARDING_MODULES} />);
    expect(screen.getByText(/boleh diaktifkan/)).toBeVisible();
  });
});
