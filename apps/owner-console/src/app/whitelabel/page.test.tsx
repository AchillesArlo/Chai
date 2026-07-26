import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import WhitelabelSettingsPage from './page';

// Mutable search state so each test can control the ?tenantId= route parameter.
const { searchState } = vi.hoisted(() => ({ searchState: { value: '' } }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchState.value),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Owner-console session is not tenant-scoped: tenantId is null.
vi.mock('@chai/auth-client/client', () => ({
  useSession: () => ({
    isAuthenticated: false,
    principalId: null,
    audience: null,
    tenantId: null,
    role: null,
  }),
}));

describe('Owner Console white-label tenant gating', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    searchState.value = '';
    fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch and asks the owner to pick a tenant when none is provided', async () => {
    render(<WhitelabelSettingsPage />);

    expect(await screen.findByText('Select a tenant to customize')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the theme scoped to the tenant supplied via the route parameter', async () => {
    searchState.value = 'tenantId=tenant-xyz';

    render(<WhitelabelSettingsPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('tenantId=tenant-xyz'));
  });
});
