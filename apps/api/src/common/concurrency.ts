import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/**
 * Resolves the expected aggregate version for a guarded mutation.
 *
 * `If-Match` is the canonical HTTP concurrency mechanism (06_API §3, GAP-006);
 * the body field is kept as a compatibility fallback for existing clients. When
 * both are supplied they must agree, otherwise the caller is confused about
 * which version it is replacing and the safe answer is to refuse.
 *
 * Missing both is a 428: a guarded mutation must never fall back to
 * last-write-wins.
 */
export function resolveExpectedVersion(
  request: FastifyRequest,
  bodyVersion?: number,
): number {
  const header = request.headers['if-match'];
  const raw = Array.isArray(header) ? header[0] : header;
  const headerVersion = raw === undefined ? undefined : parseEntityTag(raw);

  if (headerVersion !== undefined && bodyVersion !== undefined) {
    if (headerVersion !== bodyVersion) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'If-Match and expectedVersion disagree.',
      });
    }
    return headerVersion;
  }
  const resolved = headerVersion ?? bodyVersion;
  if (resolved === undefined) {
    // 428 Precondition Required: Nest has no dedicated exception class for it.
    throw new HttpException(
      {
        code: 'PRECONDITION_REQUIRED',
        message: 'If-Match is required for this mutation.',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
  return resolved;
}

/** Accepts `3`, `"3"`, and `W/"3"`; anything else is a malformed precondition. */
function parseEntityTag(value: string): number {
  const unquoted = value.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(unquoted)) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'If-Match must be an aggregate version.',
    });
  }
  const parsed = Number.parseInt(unquoted, 10);
  if (parsed < 1) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'If-Match must be a positive aggregate version.',
    });
  }
  return parsed;
}
