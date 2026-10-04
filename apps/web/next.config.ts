import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // workspace packages are shipped as TypeScript source
  transpilePackages: ["@lsp/protocol"],
  // the e2e test and phones on the LAN reach the dev server by IP
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.local", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
