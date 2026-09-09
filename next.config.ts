import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Uploaded images are streamed from the API route, not optimised at build time.
  images: { unoptimized: true },
};

export default nextConfig;
