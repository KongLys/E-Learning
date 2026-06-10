import type { NextConfig } from "next";

// Allow images from the configured object-storage backend. Locally this is MinIO
// (NEXT_PUBLIC_MINIO_URL, e.g. http://localhost:9000); in deployed environments the
// backend serves Cloudflare R2 public URLs (NEXT_PUBLIC_R2_PUBLIC_URL, the pub-*.r2.dev host).
const imageHosts = [
  process.env.NEXT_PUBLIC_MINIO_URL,
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
    'https://pub-1d58054c9ae74e6c8b513ec0379cfe78.r2.dev',
].filter((url): url is string => Boolean(url));

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    remotePatterns: imageHosts.map((url) => new URL(`${url.replace(/\/$/, '')}/**`)),
  },
};

export default nextConfig;
