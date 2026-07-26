'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { apiEventBus } from '@chai/api-client';

import { ReLoginModal } from './re-login-modal';

export interface SessionGuardProps {
  children: ReactNode;
  loginPath?: string;
}

/**
 * Session guard that listens for 401 auth errors from the API client
 * and shows a re-login modal.
 *
 * When the user clicks "Sign in again", they are redirected to /login
 * with a `next` param pointing back to the current path.
 */
export function SessionGuard({
  children,
  loginPath = '/login',
}: SessionGuardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = apiEventBus.on('auth-error', () => {
      setModalOpen(true);
    });
    return unsubscribe;
  }, []);

  function handleReLogin() {
    const currentPath = window.location.pathname;
    const next = encodeURIComponent(currentPath);
    router.push(`${loginPath}?next=${next}`);
  }

  function handleClose() {
    setModalOpen(false);
  }

  return (
    <>
      {children}
      <ReLoginModal
        onClose={handleClose}
        onReLogin={handleReLogin}
        open={modalOpen}
      />
    </>
  );
}
