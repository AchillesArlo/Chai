'use client';

import { PageState } from '@chai/ui';

export default function WhitelabelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load White-label settings"
      description="We couldn't fetch this tenant's theme configuration. Retry to reload it."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
