import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // No Next.js badge in the corner of local screen recordings.
  devIndicators: false,
};

export default nextConfig;
