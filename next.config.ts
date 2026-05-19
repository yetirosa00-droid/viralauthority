import type { NextConfig } from "next";

const nextConfig: any = {
  // Required for @xenova/transformers and ONNX Runtime to work in NextJS API Routes
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "wavefile"],
  images: {
    unoptimized: true, 
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["192.168.0.235"],
};


export default nextConfig;
