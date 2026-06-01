import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "recjjjepzpfutaxzpgjx.supabase.co",
      },
    ],
  },
};

export default nextConfig;
