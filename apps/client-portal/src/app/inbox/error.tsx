'use client';

import { PageState } from '@chai/ui';

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load your Inbox"
      description="We couldn't fetch your conversations. Retry to reload the queue."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
