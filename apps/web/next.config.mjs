/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@earthquest/types", "@earthquest/api-client", "@earthquest/game-state"],
  // Set CDN_URL (e.g. https://dxxxx.cloudfront.net) at build time to load /_next/static from CloudFront.
  assetPrefix: process.env.CDN_URL || undefined,
  async headers() {
    return [
      {
        // Sprite sheets carry a version in the filename (items.v1.svg), so they can be cached forever.
        source: "/sprites/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
