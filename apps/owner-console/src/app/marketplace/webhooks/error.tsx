'use client';

import { PageState } from '@chai/ui';

export default function WebhookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load the Webhook editor"
      description="We couldn't fetch this webhook subscription. Retry to reload it."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
