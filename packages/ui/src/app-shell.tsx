'use client';

import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

export interface NavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export interface AppShellProps {
  children: ReactNode;
  currentPath: string;
  navigation: readonly NavigationItem[];
  pageTitle: string;
  surface: 'client' | 'owner';
  tenantContext: string;
  onTenantChange?: (tenant: string) => void;
}

function NavigationLink({
  currentPath,
  item,
}: {
  currentPath: string;
  item: NavigationItem;
}) {
  const active = currentPath === item.href;
  const Icon = item.icon;

  return (
    <a
      aria-current={active ? 'page' : undefined}
      className={`group flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
        active
          ? 'bg-brand-50 text-brand-700 font-semibold'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.8} />
      <span>{item.label}</span>
    </a>
  );
}

const AVAILABLE_TENANTS = [
  'Nusantara Dental',
  'Surya Logistics',
  'Acme Healthcare',
  'All tenants',
];

const MOCK_NOTIFICATIONS = [
  { id: '1', read: false, time: '5m ago', title: 'Webhook latency restored' },
  { id: '2', read: false, time: '12m ago', title: 'New urgent ticket #402 assigned' },
  { id: '3', read: true, time: '1h ago', title: 'Monthly SLA report compiled' },
];

export function AppShell({
  children,
  currentPath,
  navigation,
  pageTitle,
  surface,
  tenantContext,
  onTenantChange,
}: AppShellProps) {
  const [activeTenant, setActiveTenant] = useState(tenantContext);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const mobileItems = navigation.slice(0, 4);
  const owner = surface === 'owner';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSelectTenant = (tenant: string) => {
    setActiveTenant(tenant);
    setShowTenantDropdown(false);
    if (onTenantChange) {
      onTenantChange(tenant);
    }
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filteredSearchItems = navigation.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="min-h-dvh bg-slate-50 text-slate-950"
      data-surface={surface}
      data-testid="app-shell"
    >
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:flex lg:flex-col ${
          owner
            ? 'border-slate-800 bg-slate-950 text-white'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-current/10 px-5">
          <span
            aria-hidden="true"
            className={`flex size-9 items-center justify-center rounded-lg text-sm font-bold ${
              owner ? 'bg-brand-500 text-white' : 'bg-brand-600 text-white'
            }`}
          >
            C
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Chai Platform</p>
            <p className={`text-xs ${owner ? 'text-slate-400' : 'text-slate-500'}`}>
              {owner ? 'Internal control' : 'Customer operations'}
            </p>
          </div>
        </div>

        {/* Tenant Context Selector */}
        <div className="relative mx-3 mt-4">
          <button
            aria-expanded={showTenantDropdown}
            aria-haspopup="listbox"
            aria-label="Tenant context dropdown"
            className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              owner
                ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-white'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
            }`}
            onClick={() => setShowTenantDropdown((prev) => !prev)}
            type="button"
          >
            <span className="min-w-0">
              <span className={`block text-xs ${owner ? 'text-slate-400' : 'text-slate-500'}`}>
                Tenant context
              </span>
              <span className="block truncate font-medium">{activeTenant}</span>
            </span>
            <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${showTenantDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showTenantDropdown && (
            <div className={`absolute left-0 top-full z-50 mt-1 w-full rounded-md border p-1 shadow-lg backdrop-blur-md ${
              owner ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
            }`}>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Switch Tenant</p>
              {AVAILABLE_TENANTS.map((t) => (
                <button
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition ${
                    t === activeTenant
                      ? 'bg-brand-600 text-white font-medium'
                      : owner
                      ? 'hover:bg-slate-800'
                      : 'hover:bg-slate-100'
                  }`}
                  key={t}
                  onClick={() => handleSelectTenant(t)}
                  type="button"
                >
                  <span>{t}</span>
                  {t === activeTenant && <Check className="size-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Primary" className="mt-4 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navigation.map((item) => (
            <NavigationLink currentPath={currentPath} item={item} key={item.href} />
          ))}
        </nav>

        <div className={`border-t p-4 text-xs ${owner ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <p className="font-medium">Stage 1 workspace</p>
          <p className="mt-1">Synthetic data only</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Open navigation"
              className="flex size-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 lg:hidden"
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-500">{activeTenant}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="relative flex items-center gap-1">
            {/* Search Trigger */}
            <button
              aria-label="Search"
              className="hidden size-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 sm:flex transition"
              onClick={() => setShowSearchModal(true)}
              type="button"
            >
              <Search aria-hidden="true" className="size-5" />
            </button>

            {/* Help Button & Popover */}
            <div className="relative">
              <button
                aria-expanded={showHelpMenu}
                aria-label="Help"
                className="hidden size-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 sm:flex transition"
                onClick={() => {
                  setShowHelpMenu((prev) => !prev);
                  setShowNotifications(false);
                  setShowProfileMenu(false);
                }}
                type="button"
              >
                <CircleHelp aria-hidden="true" className="size-5" />
              </button>

              {showHelpMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 text-slate-900">
                  <p className="px-2 py-1 text-xs font-semibold text-slate-950 border-b border-slate-100 pb-2 mb-1">
                    Help & Documentation
                  </p>
                  <a
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                    href="#docs"
                    onClick={(e) => { e.preventDefault(); alert('Opening Platform Documentation...'); setShowHelpMenu(false); }}
                  >
                    <FileText className="size-4 text-slate-400" />
                    <span>Documentation</span>
                  </a>
                  <a
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                    href="#support"
                    onClick={(e) => { e.preventDefault(); alert('Contacting Chai Support Team...'); setShowHelpMenu(false); }}
                  >
                    <CircleHelp className="size-4 text-slate-400" />
                    <span>Contact Support</span>
                  </a>
                </div>
              )}
            </div>

            {/* Notification Bell & Dropdown */}
            <div className="relative">
              <button
                aria-expanded={showNotifications}
                aria-label="Notifications"
                className="relative flex size-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 transition"
                onClick={() => {
                  setShowNotifications((prev) => !prev);
                  setShowHelpMenu(false);
                  setShowProfileMenu(false);
                }}
                type="button"
              >
                <Bell aria-hidden="true" className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50 text-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <p className="text-xs font-semibold text-slate-950">Notifications</p>
                    {unreadCount > 0 && (
                      <button
                        className="text-[11px] font-medium text-brand-600 hover:underline"
                        onClick={handleMarkAllNotificationsRead}
                        type="button"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        className={`rounded-lg p-2 text-xs ${n.read ? 'bg-white text-slate-500' : 'bg-brand-50/60 font-medium text-slate-900 border-l-2 border-brand-600'}`}
                        key={n.id}
                      >
                        <p>{n.title}</p>
                        <span className="text-[10px] text-slate-400">{n.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar & Dropdown */}
            <div className="relative">
              <button
                aria-expanded={showProfileMenu}
                aria-label="User profile menu"
                className="ml-1 flex size-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white transition hover:ring-2 hover:ring-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                onClick={() => {
                  setShowProfileMenu((prev) => !prev);
                  setShowNotifications(false);
                  setShowHelpMenu(false);
                }}
                type="button"
              >
                {owner ? 'FO' : 'NO'}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 text-slate-900">
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-950">
                      {owner ? 'Platform Founder' : 'Nadia Saputra'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {owner ? 'founder@chai-platform.io' : 'nadia@nusantaradental.id'}
                    </p>
                    <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                      {owner ? 'PLATFORM_OWNER' : 'CLIENT_OWNER'}
                    </span>
                  </div>

                  <div className="py-1">
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition"
                      onClick={() => {
                        setShowProfileModal(true);
                        setShowProfileMenu(false);
                      }}
                      type="button"
                    >
                      <User className="size-4 text-slate-400" />
                      <span>Account Profile</span>
                    </button>
                    <a
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition"
                      href="/settings"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <Settings className="size-4 text-slate-400" />
                      <span>Settings & Preferences</span>
                    </a>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 transition font-medium"
                      onClick={() => {
                        if (confirm('Are you sure you want to sign out?')) {
                          document.cookie = 'chai_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                          localStorage.clear();
                          sessionStorage.clear();
                          window.location.href = '/login';
                        }
                      }}
                      type="button"
                    >
                      <LogOut className="size-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100dvh-4rem)] w-full px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-7 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Nav */}
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href;
          return (
            <a
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? 'text-brand-700' : 'text-slate-500'
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
              <span>{item.label}</span>
            </a>
          );
        })}
        <a
          className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500"
          href="/more"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={1.8} />
          <span>More</span>
        </a>
      </nav>

      {/* Quick Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-xs p-4 pt-20">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center gap-2 flex-1">
                <Search className="size-4 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm focus:outline-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Quick search navigation & features..."
                  type="text"
                  value={searchQuery}
                />
              </div>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => setShowSearchModal(false)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2">Navigation Links</p>
              {filteredSearchItems.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-800 hover:bg-brand-50 hover:text-brand-700 transition"
                    href={item.href}
                    key={item.href}
                    onClick={() => setShowSearchModal(false)}
                  >
                    <Icon className="size-4 text-slate-500" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
              {filteredSearchItems.length === 0 && (
                <p className="p-4 text-center text-xs text-slate-500">No matching search results.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Account Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">User Profile & Account</h3>
                <p className="text-xs text-slate-500">Manage identity, credentials and authentication</p>
              </div>
              <button
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                onClick={() => setShowProfileModal(false)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {owner ? 'FO' : 'NO'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {owner ? 'Platform Founder' : 'Nadia Saputra'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {owner ? 'founder@chai-platform.io' : 'nadia@nusantaradental.id'}
                  </p>
                  <span className="mt-1 inline-block rounded bg-brand-100 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-700">
                    {owner ? 'PLATFORM_OWNER' : 'CLIENT_OWNER'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-700">
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="font-semibold text-slate-500">Active Tenant Scope:</span>
                  <span className="font-medium text-slate-900">{activeTenant}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="font-semibold text-slate-500">MFA Status:</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <Check className="size-3" /> Enrolled & Verified
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="font-semibold text-slate-500">Authentication Method:</span>
                  <span className="font-mono text-slate-900">JWT + HttpOnly Cookie</span>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs font-semibold text-slate-900 mb-2">Change Password</p>
                <div className="space-y-2">
                  <input
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:border-brand-600 focus:outline-none"
                    placeholder="Current Password"
                    type="password"
                  />
                  <input
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:border-brand-600 focus:outline-none"
                    placeholder="New Password (min 8 chars)"
                    type="password"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  className="rounded-md border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowProfileModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  onClick={() => {
                    alert('Profile and security credentials updated successfully!');
                    setShowProfileModal(false);
                  }}
                  type="button"
                >
                  Update Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
