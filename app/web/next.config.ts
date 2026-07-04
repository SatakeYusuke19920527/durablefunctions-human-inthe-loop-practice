import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Electron 本番モードで .next/standalone/server.js を spawn するための出力
  output: "standalone",
};

export default nextConfig;
