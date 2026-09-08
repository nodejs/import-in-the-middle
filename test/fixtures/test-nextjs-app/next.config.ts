import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['camelcase'],
  turbopack: {
    root: path.resolve(process.cwd(), '../../..')
  }
};

export default nextConfig;
