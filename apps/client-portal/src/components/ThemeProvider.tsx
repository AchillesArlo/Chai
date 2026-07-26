'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface ThemeConfig {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customCss: string | null;
  headerHtml: string | null;
  footerHtml: string | null;
}

const defaultTheme: ThemeConfig = {
  brandName: 'Chai',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#3B82F6',
  secondaryColor: '#10B981',
  accentColor: '#F59E0B',
  fontFamily: 'Inter, system-ui, sans-serif',
  customCss: null,
  headerHtml: null,
  footerHtml: null,
};

const ThemeContext = createContext<ThemeConfig>(defaultTheme);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme);

  useEffect(() => {
    // Try to load theme from headers (set by middleware for custom domains)
    const headers = document.querySelectorAll('meta[name^="theme-"]');
    const themeFromHeaders: Partial<ThemeConfig> = {};

    headers.forEach((meta) => {
      const name = meta.getAttribute('name')?.replace('theme-', '');
      const content = meta.getAttribute('content');
      if (name && content) {
        themeFromHeaders[name as keyof ThemeConfig] = content;
      }
    });

    if (Object.keys(themeFromHeaders).length > 0) {
      setTheme({ ...defaultTheme, ...themeFromHeaders } as ThemeConfig);
      return;
    }

    // Otherwise fetch from API
    const tenantId = localStorage.getItem('tenantId');
    if (tenantId) {
      fetch(`/api/v1/whitelabel/themes?tenantId=${tenantId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setTheme(data);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.style.setProperty('--color-primary', theme.primaryColor);
    document.documentElement.style.setProperty('--color-secondary', theme.secondaryColor);
    document.documentElement.style.setProperty('--color-accent', theme.accentColor);
    document.body.style.fontFamily = theme.fontFamily;

    // Update favicon
    if (theme.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }

    // Inject custom CSS
    if (theme.customCss) {
      let style = document.getElementById('theme-custom-css') as HTMLStyleElement;
      if (!style) {
        style = document.createElement('style');
        style.id = 'theme-custom-css';
        document.head.appendChild(style);
      }
      style.textContent = theme.customCss;
    }
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
