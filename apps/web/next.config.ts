import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    '@orbita/ui',
    '@orbita/authz',
    '@orbita/domain',
    '@orbita/db',
    '@orbita/audit',
    '@orbita/identity',
    '@orbita/library',
    '@orbita/contract',
    '@orbita/category-config',
    '@orbita/standards',
    '@orbita/taxonomy',
    '@orbita/reviews',
    '@orbita/notifications',
    '@orbita/category-publishing',
    '@orbita/sellers',
    '@orbita/brands',
  ],
  // evidence uploads (up to 4 MB) go through server actions; Vercel functions accept 4.5 MB bodies
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
