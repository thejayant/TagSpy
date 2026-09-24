import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Sora, Unbounded } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

// Refract type: Unbounded for the wordmark, Sora for display, Manrope for text, JetBrains Mono for IDs and instrument labels.
const brand = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-brand", display: "swap" });
const display = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TagSpy — See inside any GA4 & Tag Manager setup", template: "%s · TagSpy" },
  description: "Inspect the public GA4 configuration and Google Tag Manager container of any website: events, key events, consent, tags, triggers and variables.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f8" },
    { media: "(prefers-color-scheme: dark)", color: "#06070d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${brand.variable} ${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display -- icon font: "block" avoids flashing ligature names before it loads */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&display=block" />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
