'use client';

import { ChevronDown, ShieldCheck } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * Action components (04_DESIGN_SYSTEM §4.2, REQ-04-009).
 *
 * Design rule: **only one primary button per local decision area**. This is a
 * layout/authoring rule enforced by documentation and review, not a runtime
 * error — a component cannot know what else lives in its decision area, and
 * throwing at render time would turn a design smell into a production crash.
 * When you place a `<Button variant="primary">`, make sure it is the only one
 * in that card/dialog/toolbar; everything else is `secondary`, `ghost`, or
 * `link`.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-brand-600',
  link: 'text-brand-700 underline underline-offset-2 hover:text-brand-800 focus-visible:outline-brand-600',
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-brand-600',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  sm: 'min-h-9 px-3 text-xs',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  trailingIcon?: ReactNode;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className = '',
  disabled,
  fullWidth = false,
  leadingIcon,
  loading = false,
  size = 'md',
  trailingIcon,
  type,
  variant = 'primary',
  ...rest
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={`${BUTTON_BASE} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      // A loading action must not be re-triggered; disable covers both intents.
      disabled={disabled ?? loading}
      type={type ?? 'button'}
      {...rest}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {leadingIcon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: ReactNode;
  /** Required accessible name — an icon alone is never a label (04 §10, §12). */
  label: string;
  size?: ButtonSize;
  /** Visible tooltip text; defaults to `label`. */
  tooltip?: string;
  variant?: ButtonVariant;
}

const ICON_SIZE_STYLES: Record<ButtonSize, string> = {
  md: 'size-11',
  sm: 'size-9',
};

export function IconButton({
  className = '',
  disabled,
  icon,
  label,
  size = 'md',
  tooltip,
  type,
  variant = 'ghost',
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`${BUTTON_BASE} ${VARIANT_STYLES[variant]} ${ICON_SIZE_STYLES[size]} p-0 ${className}`}
      disabled={disabled}
      title={tooltip ?? label}
      type={type ?? 'button'}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}

export interface SplitButtonAction {
  description?: string;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}

export interface SplitButtonProps {
  /** Safe alternatives to the primary action (04 §4.2: "action with safe alternatives"). */
  actions: readonly SplitButtonAction[];
  disabled?: boolean;
  /** Accessible name for the menu toggle. */
  menuLabel?: string;
  onPrimary: () => void;
  primaryLabel: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

/**
 * A primary action plus a menu of safe alternatives. Full keyboard support per
 * the ARIA menu-button pattern (04 §12): ArrowDown/ArrowUp open and move focus,
 * Home/End jump, Escape closes and returns focus to the toggle, Tab dismisses.
 */
export function SplitButton({
  actions,
  disabled = false,
  menuLabel = 'More actions',
  onPrimary,
  primaryLabel,
  size = 'md',
  variant = 'primary',
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function closeMenu(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }

  function onToggleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (actions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(0);
      setOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(actions.length - 1);
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % actions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + actions.length) % actions.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(actions.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  function activate(action: SplitButtonAction) {
    action.onClick();
    closeMenu(true);
  }

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <Button
        className="rounded-r-none"
        disabled={disabled}
        onClick={onPrimary}
        size={size}
        variant={variant}
      >
        {primaryLabel}
      </Button>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={menuLabel}
        className={`${BUTTON_BASE} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} -ml-px rounded-l-none px-2`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onToggleKeyDown}
        ref={toggleRef}
        type="button"
      >
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && actions.length > 0 ? (
        <div
          aria-label={menuLabel}
          className="absolute right-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onKeyDown={onMenuKeyDown}
          role="menu"
        >
          {actions.map((action, index) => (
            <button
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
              key={action.label}
              onClick={() => activate(action)}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              type="button"
            >
              <span className="flex items-center gap-2 font-medium">
                {action.icon ? (
                  <span aria-hidden="true" className="shrink-0">
                    {action.icon}
                  </span>
                ) : null}
                {action.label}
              </span>
              {action.description ? (
                <span className="text-xs text-slate-500">{action.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type ApprovalState = 'ready' | 'awaiting-approval' | 'approved';

export interface ApprovalButtonProps {
  /** Required approver name or role, always shown so risk is never hidden. */
  approver: string;
  /** Action label, e.g. "Setujui refund". */
  label: string;
  onRequest?: () => void;
  /**
   * Wire this to the policy engine's `REQUIRE_APPROVAL` decision (FASE 4):
   * `ready` before a request, `awaiting-approval` while a decision is pending,
   * `approved` once the approver has signed off.
   */
  state?: ApprovalState;
  /** Short risk descriptor shown beside the approver. */
  risk?: string;
  size?: ButtonSize;
}

export function ApprovalButton({
  approver,
  label,
  onRequest,
  risk,
  size = 'md',
  state = 'ready',
}: ApprovalButtonProps) {
  return (
    <div className="inline-flex flex-col gap-1">
      {state === 'approved' ? (
        <span
          className={`${BUTTON_BASE} ${SIZE_STYLES[size]} bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200`}
          role="status"
        >
          <ShieldCheck aria-hidden="true" className="size-4" />
          Disetujui oleh {approver}
        </span>
      ) : (
        <Button
          aria-busy={state === 'awaiting-approval' || undefined}
          disabled={state === 'awaiting-approval'}
          leadingIcon={<ShieldCheck className="size-4" />}
          onClick={onRequest}
          size={size}
          variant="danger"
        >
          {state === 'awaiting-approval' ? `Menunggu persetujuan ${approver}` : label}
        </Button>
      )}
      <span className="text-xs text-slate-500">
        Perlu persetujuan: <span className="font-medium text-slate-700">{approver}</span>
        {risk ? <span className="text-amber-700"> · {risk}</span> : null}
      </span>
    </div>
  );
}
