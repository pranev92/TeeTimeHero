import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BullMQ / ioredis are Node-only — exclude from the browser bundle
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
