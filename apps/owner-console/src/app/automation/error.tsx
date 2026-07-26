'use client';

import { PageState } from '@chai/ui';

export default function AutomationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load Automation flows"
      description="We couldn't fetch your automation flows. Retry to reload them."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
