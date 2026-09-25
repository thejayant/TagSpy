import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  // Chromium is resolved from its package folder at runtime, so it must not be bundled.
  serverExternalPackages: ["better-sqlite3", "nodemailer", "puppeteer-core", "@sparticuz/chromium-min"],
  poweredByHeader: false,
  // Lets the dev server work behind a temporary Cloudflare Quick Tunnel (`cloudflared tunnel --url http://localhost:3000`).
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
