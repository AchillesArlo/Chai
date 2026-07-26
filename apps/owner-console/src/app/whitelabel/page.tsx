'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@chai/auth-client/client';
import { AppShell, PageState } from '@chai/ui';
import { OWNER_CONSOLE_NAVIGATION } from '../../config/navigation';

interface ThemeSettings {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customCss: string | null;
}

function WhitelabelSettingsContent() {
  // Tenant must come from a real source: the session's tenant claim, or an
  // explicit ?tenantId= route parameter (owner deep-links from a tenant).
  // The owner-console session is not tenant-scoped, so there is no fabricated
  // fallback — without a tenant we refuse to fetch and ask the owner to pick one.
  const sessionTenant = useSession().tenantId;
  const searchParams = useSearchParams();
  const tenantId = sessionTenant ?? searchParams.get('tenantId');

  const [theme, setTheme] = useState<ThemeSettings>({
    brandName: '',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    accentColor: '#F59E0B',
    fontFamily: 'Inter, system-ui, sans-serif',
    customCss: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/v1/whitelabel/themes?tenantId=${encodeURIComponent(tenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setTheme(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleChange = (field: keyof ThemeSettings, value: string) => {
    setTheme((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/v1/whitelabel/themes?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      });

      if (res.ok) {
        const updated = await res.json();
        setTheme(updated);
        alert('Theme saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
      alert('Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      currentPath="/whitelabel"
      navigation={OWNER_CONSOLE_NAVIGATION}
      pageTitle="Whitelabel & Theme Customization"
      surface="owner"
      tenantContext="Platform Owner"
    >
      <div className="mx-auto max-w-4xl p-6">
        {!tenantId ? (
          <PageState
            state="empty"
            title="Select a tenant to customize"
            description="White-label themes are configured per tenant. Open this page for a specific tenant from the Tenants directory (or append ?tenantId=… to the URL) to load and edit its branding. No tenant is loaded and nothing is fetched until you choose one."
            action={
              <Link
                href="/tenants"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Go to Tenants
              </Link>
            }
          />
        ) : loading ? (
          <PageState state="loading" title="Loading theme settings" />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">White-label Settings</h1>
              <p className="text-sm text-gray-500 mt-1">
                Customize the appearance of your client portal.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {/* Brand Name */}
              <div>
                <label htmlFor="brandName" className="block text-sm font-medium text-gray-700 mb-1">
                  Brand Name
                </label>
                <input
                  id="brandName"
                  type="text"
                  value={theme.brandName}
                  onChange={(e) => handleChange('brandName', e.target.value)}
                  required
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label htmlFor="logoUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL
                </label>
                <input
                  id="logoUrl"
                  type="url"
                  value={theme.logoUrl ?? ''}
                  onChange={(e) => handleChange('logoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Favicon URL */}
              <div>
                <label htmlFor="faviconUrl" className="block text-sm font-medium text-gray-700 mb-1">
                  Favicon URL
                </label>
                <input
                  id="faviconUrl"
                  type="url"
                  value={theme.faviconUrl ?? ''}
                  onChange={(e) => handleChange('faviconUrl', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Colors */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="primaryColor" className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="primaryColor"
                      type="color"
                      value={theme.primaryColor}
                      onChange={(e) => handleChange('primaryColor', e.target.value)}
                      className="h-10 w-10 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={theme.primaryColor}
                      onChange={(e) => handleChange('primaryColor', e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="secondaryColor" className="block text-sm font-medium text-gray-700 mb-1">
                    Secondary Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="secondaryColor"
                      type="color"
                      value={theme.secondaryColor}
                      onChange={(e) => handleChange('secondaryColor', e.target.value)}
                      className="h-10 w-10 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={theme.secondaryColor}
                      onChange={(e) => handleChange('secondaryColor', e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="accentColor" className="block text-sm font-medium text-gray-700 mb-1">
                    Accent Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="accentColor"
                      type="color"
                      value={theme.accentColor}
                      onChange={(e) => handleChange('accentColor', e.target.value)}
                      className="h-10 w-10 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={theme.accentColor}
                      onChange={(e) => handleChange('accentColor', e.target.value)}
                      className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label htmlFor="fontFamily" className="block text-sm font-medium text-gray-700 mb-1">
                  Font Family
                </label>
                <input
                  id="fontFamily"
                  type="text"
                  value={theme.fontFamily}
                  onChange={(e) => handleChange('fontFamily', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Custom CSS */}
              <div>
                <label htmlFor="customCss" className="block text-sm font-medium text-gray-700 mb-1">
                  Custom CSS
                </label>
                <textarea
                  id="customCss"
                  value={theme.customCss ?? ''}
                  onChange={(e) => handleChange('customCss', e.target.value)}
                  rows={6}
                  placeholder="body { background: #f5f5f5; }"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Custom CSS will be injected into the client portal.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-brand-600 px-6 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Theme'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function WhitelabelSettingsPage() {
  return (
    <Suspense fallback={<PageState state="loading" title="Loading white-label settings" />}>
      <WhitelabelSettingsContent />
    </Suspense>
  );
}
