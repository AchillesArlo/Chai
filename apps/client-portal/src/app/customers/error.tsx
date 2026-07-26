'use client';

import { PageState } from '@chai/ui';

export default function CustomersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageState
      state="error"
      title="Couldn't load Customers"
      description="We couldn't fetch the customer directory. Retry to reload it."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}
