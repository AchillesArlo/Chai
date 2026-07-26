import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Only override the data hook; the real module's other exports (used by the
// shared test-setup, e.g. setDefaultHttpClient) must stay intact.
vi.mock('@chai/api-client/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useApiQuery: vi.fn() };
});

import { useApiQuery } from '@chai/api-client/react';
import { TeamManagement, type MemberRow } from './team-management';

const mockUseApiQuery = vi.mocked(useApiQuery);

const MEMBERS: MemberRow[] = [
  { id: 'm-owner', role: 'CLIENT_OWNER', status: 'ACTIVE', userId: 'user-owner' },
  { id: 'm-agent', role: 'CLIENT_AGENT', status: 'ACTIVE', userId: 'user-agent' },
  { id: 'm-invited', role: 'CLIENT_MANAGER', status: 'INVITED', userId: 'user-maya' },
];

describe('Client Portal team management', () => {
  it('renders the tenant roster and pending invitations from the API', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseApiQuery.mockReturnValue({ data: MEMBERS, error: null, isLoading: false } as any);

    render(<TeamManagement />);

    expect(screen.getByText('Customer operations')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Team & roles' })).toBeVisible();
    expect(screen.getByText('Members')).toBeVisible();
    expect(screen.getByText('Pending invitations')).toBeVisible();
    expect(screen.getByText('CLIENT_OWNER')).toBeVisible();
    expect(screen.getByText('user-owner')).toBeVisible();
    // An INVITED membership surfaces as a pending invitation, not an active member.
    expect(screen.getByText('user-maya')).toBeVisible();
    expect(screen.queryByText('Internal control')).not.toBeInTheDocument();
  });

  it('shows a loading state while the roster is fetched', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseApiQuery.mockReturnValue({ data: undefined, error: null, isLoading: true } as any);

    render(<TeamManagement />);

    expect(screen.getByText('Loading team…')).toBeVisible();
  });
});
