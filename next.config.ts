import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
