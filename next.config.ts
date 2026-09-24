import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["better-sqlite3", "nodemailer"],
  poweredByHeader: false,
  // Lets the dev server work behind a temporary Cloudflare Quick Tunnel (`cloudflared tunnel --url http://localhost:3000`).
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
