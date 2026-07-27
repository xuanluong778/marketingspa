/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@marketingspa/shared'],
  eslint: { ignoreDuringBuilds: true },
  // standalone dùng khi build Docker trên Linux; tắt trên Windows dev (symlink EPERM)
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' } : {}),
  async headers() {
    return [
      {
        // HTML/pages: không cache dài — tránh HTML cũ trỏ hash CSS/JS đã xóa sau deploy (400/unstyled)
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/brand/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/chatbot/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/favicon.png', permanent: false }];
  },
};

module.exports = nextConfig;
