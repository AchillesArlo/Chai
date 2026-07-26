'use client';

import { PageState } from '@chai/ui';

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load Analytics & Insights"
      description="We couldn't fetch your analytics outcomes. Retry to reload the latest metrics."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
