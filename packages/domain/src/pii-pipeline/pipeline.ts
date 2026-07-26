// ponytail: PII redaction pipeline for audit logs.
// Reuses guardrail patterns from ai-gateway but operates on structured audit records.

/**
 * PII field classifications.
 */
export type PiiFieldClass =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ssn'
  | 'nik'
  | 'ip_address'
  | 'none';

/**
 * PII redaction rule per field name.
 */
export interface PiiRedactionRule {
  fieldPattern: RegExp;
  class: PiiFieldClass;
  replacement: string;
}

/**
 * Default redaction rules — field names that commonly contain PII.
 */
const DEFAULT_RULES: PiiRedactionRule[] = [
  { fieldPattern: /email|e-mail|emailAddress/i, class: 'email', replacement: '[REDACTED_EMAIL]' },
  { fieldPattern: /phone|mobile|phoneNumber|contactNumber/i, class: 'phone', replacement: '[REDACTED_PHONE]' },
  { fieldPattern: /creditCard|cardNumber|pan/i, class: 'credit_card', replacement: '[REDACTED_CARD]' },
  { fieldPattern: /ssn|socialSecurity/i, class: 'ssn', replacement: '[REDACTED_SSN]' },
  { fieldPattern: /nik|nationalId|idNumber/i, class: 'nik', replacement: '[REDACTED_NIK]' },
  { fieldPattern: /ipAddress|clientIp|remoteIp/i, class: 'ip_address', replacement: '[REDACTED_IP]' },
];

/**
 * Value-level PII patterns (for scanning string values).
 */
const VALUE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b\d{16}\b/g, replacement: '[REDACTED_NIK]' },
  { pattern: /\b(?:\d{4}[ -]?){3}\d{1,4}\b/g, replacement: '[REDACTED_CARD]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[REDACTED_IP]' },
];

/**
 * PII redaction result.
 */
export interface PiiRedactionResult {
  redacted: Record<string, unknown>;
  redactions: Array<{ class: PiiFieldClass; field: string }>;
}

/**
 * PII redaction pipeline for audit logs.
 */
export class PiiRedactionPipeline {
  private rules: PiiRedactionRule[];

  constructor(rules: PiiRedactionRule[] = DEFAULT_RULES) {
    this.rules = rules;
  }

  /**
   * Redact PII from a field name based on rules.
   */
  classifyField(fieldName: string): PiiFieldClass {
    for (const rule of this.rules) {
      if (rule.fieldPattern.test(fieldName)) {
        return rule.class;
      }
    }
    return 'none';
  }

  /**
   * Redact a single value (scan string values for PII patterns).
   */
  redactValue(value: unknown, fieldClass: PiiFieldClass = 'none'): unknown {
    if (typeof value !== 'string') return value;

    // If field is classified, replace entire value
    if (fieldClass !== 'none') {
      const rule = this.rules.find((r) => r.class === fieldClass);
      if (rule) return rule.replacement;
    }

    // Otherwise scan string for PII patterns
    let result = value;
    for (const { pattern, replacement } of VALUE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  /**
   * Redact PII from an audit log record (recursive).
   */
  redact(record: Record<string, unknown>): PiiRedactionResult {
    const redactions: Array<{ class: PiiFieldClass; field: string }> = [];
    const redacted = this.redactObject(record, redactions, '');
    return { redacted, redactions };
  }

  private redactObject(
    obj: Record<string, unknown>,
    redactions: Array<{ class: PiiFieldClass; field: string }>,
    path: string
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const fieldClass = this.classifyField(key);

      if (fieldClass !== 'none') {
        redactions.push({ class: fieldClass, field: fieldPath });
        result[key] = this.redactValue(value, fieldClass);
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>, redactions, fieldPath);
      } else if (Array.isArray(value)) {
        result[key] = value.map((v) =>
          v !== null && typeof v === 'object' && !Array.isArray(v)
            ? this.redactObject(v as Record<string, unknown>, redactions, fieldPath)
            : this.redactValue(v)
        );
      } else {
        result[key] = this.redactValue(value);
      }
    }

    return result;
  }

  /**
   * Add a custom redaction rule.
   */
  addRule(rule: PiiRedactionRule): void {
    this.rules.push(rule);
  }

  /**
   * Reset to default rules.
   */
  reset(): void {
    this.rules = [...DEFAULT_RULES];
  }
}

/**
 * Default singleton instance.
 */
let defaultPipeline: PiiRedactionPipeline | null = null;

/**
 * Get or create the default PII redaction pipeline.
 */
export function getPiiRedactionPipeline(): PiiRedactionPipeline {
  if (!defaultPipeline) {
    defaultPipeline = new PiiRedactionPipeline();
  }
  return defaultPipeline;
}

/**
 * Reset the default pipeline (for testing).
 */
export function resetPiiRedactionPipeline(): void {
  defaultPipeline = null;
}

/**
 * Create a new PII redaction pipeline instance.
 */
export function createPiiRedactionPipeline(rules?: PiiRedactionRule[]): PiiRedactionPipeline {
  return new PiiRedactionPipeline(rules);
}
