import type { NextConfig } from 'next';

// Served behind nginx at /portal/* (infra/*/nginx.conf `location /portal/`).
// basePath auto-prefixes next/link and next/router so internal navigation
// needs no change; NextResponse.redirect() with an absolute external base URL
// (see logout/route.ts) does NOT get auto-prefixed and must add /portal itself.
const config: NextConfig = {
  basePath: '/portal',
  transpilePackages: ['@chai/ui'],
};

export default config;
