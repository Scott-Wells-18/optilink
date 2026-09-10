import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Uploaded images are streamed from the API route, not optimised at build time.
  images: { unoptimized: true },
  /*
   * tesseract.js starts a Node worker by requiring a file by path. Bundling it
   * moves that file and the require fails, so it is left where it was
   * installed and loaded from there at runtime.
   */
  serverExternalPackages: ["tesseract.js", "sharp"],
};

export default nextConfig;
