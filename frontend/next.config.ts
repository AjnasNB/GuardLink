import type { NextConfig } from "next";
import path from 'node:path';

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  transpilePackages: ['@guardlink/domain'],
  turbopack: {root:path.resolve(__dirname,'..')},
  outputFileTracingRoot:path.resolve(__dirname,'..'),
};

export default nextConfig;
