import { render, screen } from '@testing-library/react';
import { Activity, BookOpen, House, Inbox, Settings, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import {
  AppShell,
  DataStateBanner,
  MetricCard,
  PageState,
  StatusBadge,
} from './index';

const navigation = [
  { href: '/', icon: House, label: 'Home' },
  { href: '/inbox', icon: Inbox, label: 'Inbox' },
  { href: '/contacts', icon: Users, label: 'Contacts' },
  { href: '/knowledge', icon: BookOpen, label: 'Knowledge' },
  { href: '/health', icon: Activity, label: 'Health' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

describe('AppShell', () => {
  it('renders persistent tenant context and separate owner styling', () => {
    render(
      <AppShell
        currentPath="/"
        navigation={navigation}
        pageTitle="Platform overview"
        surface="owner"
        tenantContext="All tenants"
      >
        <p>Operational content</p>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    expect(screen.getAllByText('All tenants')).toHaveLength(2);
    expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-surface',
      'owner',
    );
    expect(screen.getByRole('main')).toHaveTextContent('Operational content');
  });

  it('limits mobile navigation to four primary items plus More', () => {
    render(
      <AppShell
        currentPath="/"
        navigation={navigation}
        pageTitle="Home"
        surface="client"
        tenantContext="Nusantara Dental"
      >
        <p>Client content</p>
      </AppShell>,
    );

    const mobile = screen.getByRole('navigation', { name: 'Mobile' });
    expect(mobile.querySelectorAll('a')).toHaveLength(5);
    expect(mobile).toHaveTextContent('More');
    expect(mobile).not.toHaveTextContent('Health');
  });
});

describe('operational feedback components', () => {
  it('renders loading, empty, and retryable error states accessibly', () => {
    const { rerender } = render(<PageState state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');

    rerender(
      <PageState
        action={<button type="button">Connect channel</button>}
        description="Add the first customer channel."
        state="empty"
        title="No channels yet"
      />,
    );
    expect(screen.getByText('No channels yet')).toBeVisible();

    const retry = vi.fn();
    rerender(
      <PageState
        correlationId="01890f47"
        description="The provider did not respond."
        onRetry={retry}
        state="error"
        title="Channel unavailable"
      />,
    );
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('01890f47');
  });

  it('shows freshness, source, and text-based statuses', () => {
    render(
      <>
        <MetricCard
          freshness="Updated 2 minutes ago"
          label="Successful outcomes"
          trend="+8.2%"
          value="128"
        />
        <DataStateBanner
          detail="Meta webhook last arrived 18 minutes ago."
          state="stale"
        />
        <StatusBadge label="Human active" tone="info" />
      </>,
    );

    expect(screen.getByText('Updated 2 minutes ago')).toBeVisible();
    expect(screen.getByText(/Meta webhook/)).toBeVisible();
    expect(screen.getByText('Human active')).toBeVisible();
  });
});
