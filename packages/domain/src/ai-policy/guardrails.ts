export interface GuardrailOptions {
  allowedDomains?: readonly string[];
  maxToolsPerTurn?: number;
  history?: Array<{ parameters: Record<string, unknown>; tool: string }>;
}

export const DEFAULT_MAX_TOOLS_PER_TURN = 5;
export const DEFAULT_ALLOWED_DOMAINS = ['cdn.chai-platform.io', 'media.whatsapp.net', 'images.unsplash.com'];

/**
 * REQ-08-030: Evaluates turn limits and loop detection for AI tool invocations.
 */
export function evaluateAIGuardrails(
  tool: string,
  parameters: Record<string, unknown>,
  options: GuardrailOptions = {},
): { allowed: boolean; code?: string; reason?: string } {
  const maxLimit = options.maxToolsPerTurn ?? DEFAULT_MAX_TOOLS_PER_TURN;
  const history = options.history ?? [];

  // 1. Tool execution count limit
  if (history.length >= maxLimit) {
    return {
      allowed: false,
      code: 'MAX_TOOL_CALLS_EXCEEDED',
      reason: `Execution exceeded maximum tool call limit of ${maxLimit} per turn`,
    };
  }

  // 2. Loop detection: check if identical tool and parameters were called in history
  const paramString = JSON.stringify(parameters);
  const isLoop = history.some(
    (item) => item.tool === tool && JSON.stringify(item.parameters) === paramString,
  );

  if (isLoop) {
    return {
      allowed: false,
      code: 'LOOP_DETECTED',
      reason: `Loop detected: tool ${tool} was called repeatedly with identical parameters`,
    };
  }

  // 3. Domain allowlist check for URL parameters
  for (const value of Object.values(parameters)) {
    if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
      const ssrfCheck = validateSsrfUrl(value, options.allowedDomains);
      if (!ssrfCheck.allowed) {
        return ssrfCheck;
      }
    }
  }

  return { allowed: true };
}

/**
 * REQ-10-018: SSRF-safe URL validation.
 * Rejects private/loopback IP addresses and un-whitelisted domains.
 */
export function validateSsrfUrl(
  urlString: string,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_DOMAINS,
): { allowed: boolean; code?: string; reason?: string } {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    // Reject private / loopback / link-local IP addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return {
        allowed: false,
        code: 'SSRF_PRIVATE_IP_REJECTED',
        reason: `URL ${urlString} points to a private or loopback IP address`,
      };
    }

    // Domain allowlist check
    const isDomainAllowed = allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );

    if (!isDomainAllowed) {
      return {
        allowed: false,
        code: 'DOMAIN_NOT_ALLOWED',
        reason: `Domain ${hostname} is not in the allowed domain list`,
      };
    }

    return { allowed: true };
  } catch {
    return {
      allowed: false,
      code: 'INVALID_URL',
      reason: `Malformed URL string: ${urlString}`,
    };
  }
}
