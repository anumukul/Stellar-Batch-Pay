import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@stellar/freighter-api"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stellar/freighter-api": "@stellar/freighter-api/build/index.min.js",
    };
    return config;
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "@stellar/freighter-api": "@stellar/freighter-api/build/index.min.js",
    },
  },
}

export default nextConfig
