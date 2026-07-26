import { AlertTriangle, Inbox, LoaderCircle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageStateBaseProps {
  description?: string;
  title?: string;
}

type PageStateProps =
  | ({ state: 'loading' } & PageStateBaseProps)
  | ({ action?: ReactNode; state: 'empty' } & PageStateBaseProps)
  | ({ correlationId?: string; onRetry?: () => void; state: 'error' } &
      PageStateBaseProps);

export function PageState(props: PageStateProps) {
  if (props.state === 'loading') {
    return (
      <div
        aria-live="polite"
        className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-brand-600 motion-reduce:animate-none" />
        <p className="mt-3 text-sm font-medium text-slate-700">
          {props.title ?? 'Loading operational data'}
        </p>
      </div>
    );
  }

  if (props.state === 'empty') {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Inbox aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-950">
          {props.title ?? 'No items yet'}
        </h2>
        {props.description ? (
          <p className="mt-1 max-w-md text-sm text-slate-500">{props.description}</p>
        ) : null}
        {props.action ? <div className="mt-5">{props.action}</div> : null}
      </section>
    );
  }

  return (
    <section
      className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center"
      role="alert"
    >
      <AlertTriangle aria-hidden="true" className="size-7 text-red-600" />
      <h2 className="mt-4 text-base font-semibold text-red-950">
        {props.title ?? 'Unable to load this page'}
      </h2>
      {props.description ? (
        <p className="mt-1 max-w-md text-sm text-red-800">{props.description}</p>
      ) : null}
      {props.correlationId ? (
        <p className="mt-3 font-mono text-xs text-red-700">
          Correlation ID: {props.correlationId}
        </p>
      ) : null}
      {props.onRetry ? (
        <button
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          onClick={props.onRetry}
          type="button"
        >
          <RotateCw aria-hidden="true" className="size-4" />
          Try again
        </button>
      ) : null}
    </section>
  );
}
