import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next does not pick up the stray lockfile in $HOME.
    root: path.join(__dirname),
  },
};

export default nextConfig;
