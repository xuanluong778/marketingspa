/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@marketingspa/shared'],
  // standalone dùng khi build Docker trên Linux; tắt trên Windows dev (symlink EPERM)
  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' } : {}),
  async headers() {
    return [
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
    return [{ source: '/favicon.ico', destination: '/favicon.svg', permanent: false }];
  },
};

module.exports = nextConfig;
