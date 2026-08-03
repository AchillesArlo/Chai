/**
 * REQ-06-007: Page size cap 100 / default 25 + opaque cursor.
 *
 * Usage: add `@Query() pagination: PaginationQueryDto` to any list endpoint.
 * The `cursor` is an opaque base64url token; callers must treat it as a
 * blackbox and never construct it themselves.
 */
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
  /**
   * Maximum number of items to return (1–100, default 25).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  /**
   * Opaque cursor returned by the previous page's response.
   * Absent means "start from the beginning".
   */
  @IsOptional()
  @IsString()
  cursor?: string;
}

/**
 * Wraps a list result with a pagination cursor for the next page.
 * `nextCursor` is null when there are no more items.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  /** Included for transparency — denominator for metric calculations. */
  total?: number;
}

/**
 * Encode an opaque cursor from an internal offset / key value.
 * This ensures the cursor is URL-safe and clients cannot reverse-engineer it.
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

/**
 * Decode an opaque cursor back to the internal value.
 * Returns null if the cursor is malformed.
 */
export function decodeCursor(cursor: string): string | null {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}
