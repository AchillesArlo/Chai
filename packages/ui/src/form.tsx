'use client';

import { AlertCircle } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

export type ValidationRule = (value: string, formData: Record<string, string>) => string | undefined;

export interface FormFieldProps {
  defaultValue?: string;
  label: string;
  name: string;
  placeholder?: string;
  rules?: ValidationRule[];
  type?: 'email' | 'password' | 'text' | 'number';
}

export interface FormProps {
  children: (props: {
    errors: Record<string, string>;
    field: (fieldProps: FormFieldProps) => ReactNode;
    isSubmitting: boolean;
    values: Record<string, string>;
  }) => ReactNode;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
  submitLabel?: string;
}

export function Form({ children, onSubmit, submitLabel = 'Submit' }: FormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fields, setFields] = useState<Map<string, FormFieldProps>>(new Map());

  function registerField(props: FormFieldProps) {
    if (!fields.has(props.name)) {
      setFields((prev) => new Map(prev).set(props.name, props));
    }
  }

  function setValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name)),
      );
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const [, fieldProps] of fields) {
      const value = values[fieldProps.name] ?? fieldProps.defaultValue ?? '';
      for (const rule of fieldProps.rules ?? []) {
        const error = rule(value, values);
        if (error) {
          newErrors[fieldProps.name] = error;
          break;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderField(fieldProps: FormFieldProps): ReactNode {
    registerField(fieldProps);
    const value = values[fieldProps.name] ?? fieldProps.defaultValue ?? '';
    const error = errors[fieldProps.name];

    return (
      <div key={fieldProps.name} className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700" htmlFor={fieldProps.name}>
          {fieldProps.label}
        </label>
        <input
          aria-invalid={Boolean(error)}
          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
          }`}
          id={fieldProps.name}
          onChange={(e) => setValue(fieldProps.name, e.target.value)}
          placeholder={fieldProps.placeholder}
          type={fieldProps.type ?? 'text'}
          value={value}
        />
        {error ? (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle aria-hidden="true" className="size-3" />
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {children({ errors, field: renderField, isSubmitting, values })}
      <button
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-55"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Submitting...' : submitLabel}
      </button>
    </form>
  );
}

// Validation rule helpers
export const required = (message = 'This field is required'): ValidationRule => (value) =>
  value.trim() === '' ? message : undefined;

export const minLength = (n: number, message?: string): ValidationRule => (value) =>
  value.length < n ? message ?? `Must be at least ${n} characters` : undefined;

export const maxLength = (n: number, message?: string): ValidationRule => (value) =>
  value.length > n ? message ?? `Must be at most ${n} characters` : undefined;

export const email = (message = 'Must be a valid email'): ValidationRule => (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : message;

export const matches = (
  pattern: RegExp,
  message = 'Invalid format'
): ValidationRule => (value) =>
  pattern.test(value) ? undefined : message;
