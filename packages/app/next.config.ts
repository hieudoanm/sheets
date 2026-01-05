import type { NextConfig } from 'next';

const NODE_ENV = process.env.NODE_ENV ?? 'development';

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  basePath: NODE_ENV === 'development' ? '' : '/csv',
  output: NODE_ENV === 'development' ? 'standalone' : 'export',
  distDir: NODE_ENV === 'development' ? '.next' : '../../docs',
};

export default nextConfig;
