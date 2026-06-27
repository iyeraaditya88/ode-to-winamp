/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['framer-motion', '@tanstack/react-query'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
      },
      {
        protocol: 'https',
        hostname: 'mosaic.scdn.co',
      },
      {
        protocol: 'https',
        hostname: '*.spotifycdn.com',
      },
    ],
  },
};

export default nextConfig;
