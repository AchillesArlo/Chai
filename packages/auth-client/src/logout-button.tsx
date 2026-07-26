'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

export interface LogoutButtonProps {
  className?: string;
  label?: string;
  logoutPath?: string;
}

/**
 * Logout button that POSTs to the logout route handler.
 * Uses a form POST to ensure cookies are cleared server-side.
 */
export function LogoutButton({
  className = '',
  label = 'Sign out',
  logoutPath = '/logout',
}: LogoutButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  function handleClick() {
    setSubmitting(true);
    // Use fetch to trigger the POST /logout route handler
    fetch(logoutPath, { method: 'POST' })
      .then((res) => {
        if (res.redirected) {
          window.location.href = res.url;
        } else {
          window.location.href = '/login';
        }
      })
      .catch(() => {
        window.location.href = '/login';
      })
      .finally(() => setSubmitting(false));
  }

  return (
    <button
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-55 ${className}`}
      disabled={submitting}
      onClick={handleClick}
      type="button"
    >
      <LogOut aria-hidden="true" className="size-4" />
      {submitting ? 'Signing out...' : label}
    </button>
  );
}
