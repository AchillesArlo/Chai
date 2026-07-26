'use client';

import { LogIn } from 'lucide-react';
import { useState } from 'react';

import { Modal } from '@chai/ui';

export interface ReLoginModalProps {
  onClose: () => void;
  onReLogin: () => void;
  open: boolean;
}

/**
 * Re-login modal shown when a session has expired (401 detected).
 * Offers the user to re-authenticate without losing their place.
 */
export function ReLoginModal({ onClose, onReLogin, open }: ReLoginModalProps) {
  const [redirecting, setRedirecting] = useState(false);

  function handleReLogin() {
    setRedirecting(true);
    onReLogin();
  }

  return (
    <Modal
      description="Your session has expired. Please sign in again to continue."
      onClose={onClose}
      open={open}
      size="sm"
      title="Session Expired"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          For your security, you have been signed out due to inactivity or an expired token.
          Any unsaved work may be lost.
        </p>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Dismiss
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-55"
            disabled={redirecting}
            onClick={handleReLogin}
            type="button"
          >
            <LogIn aria-hidden="true" className="size-4" />
            {redirecting ? 'Redirecting...' : 'Sign in again'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
