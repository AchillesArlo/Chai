/**
 * Server-only auth surface.
 *
 * `credentials`, `scrypt`, and `totp` need `node:crypto`, which the Edge Runtime
 * does not provide. They used to be re-exported from the package barrel, so a
 * Next.js middleware importing anything from `@chai/auth` dragged Node-only
 * crypto into the Edge bundle and `next build` reported "Ecmascript file had an
 * error" for every frontend.
 *
 * Keeping them behind `@chai/auth/server` means the boundary is enforced by the
 * module graph rather than by remembering: an Edge consumer physically cannot
 * reach password hashing or TOTP.
 */
export * from './credentials';
export * from './scrypt';
export * from './totp';
