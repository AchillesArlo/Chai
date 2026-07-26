'use client';

import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  title?: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  dismiss: (id: string) => void;
  show: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ dismiss, show }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} onDismiss={() => dismiss(toast.id)} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

const toneConfig = {
  error: { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, iconColor: 'text-red-600' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Info, iconColor: 'text-blue-600' },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2, iconColor: 'text-emerald-600' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertCircle, iconColor: 'text-amber-600' },
};

function ToastCard({ onDismiss, toast }: { onDismiss: () => void; toast: ToastItem }) {
  const config = toneConfig[toast.tone];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border ${config.border} ${config.bg} p-3 shadow-md min-w-[280px] max-w-sm`}
      role="alert"
    >
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${config.iconColor}`} />
      <div className="flex-1">
        {toast.title ? (
          <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
        ) : null}
        <p className="text-sm text-slate-700">{toast.message}</p>
      </div>
      <button
        aria-label="Dismiss"
        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
