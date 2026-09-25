import type { Metadata, Viewport } from "next";
import { Cookie, JetBrains_Mono, Manrope, Sora, Unbounded } from "next/font/google";
import { MotionRoot } from "@/components/motion";
import { OmniboxPalette } from "@/components/omnibox";
import { ToastProvider } from "@/components/toast";
import { appUrl } from "@/lib/env";
import "./globals.css";

// Refract type: Unbounded for the wordmark, Sora for display, Manrope for text, JetBrains Mono for IDs and instrument labels.
const brand = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-brand", display: "swap" });
const display = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Cookie: the script face of the Buy Me a Coffee button.
const cookie = Cookie({ subsets: ["latin"], weight: "400", variable: "--font-cookie", display: "swap" });

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs.
  metadataBase: new URL(appUrl()),
  title: { default: "TagSpy: Free Website Inspector", template: "%s · TagSpy" },
  description: "Inspect any website for free: its GA4 setup, Google Tag Manager container, Meta Pixel, Segment destinations, technology stack and fonts, and whether it was built with AI.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f8" },
    { media: "(prefers-color-scheme: dark)", color: "#06070d" },
  ],
};

/**
 * Turns on the hero intro. It is CSS, so it starts the moment a hero is painted (on the first load and after every
 * client-side navigation) instead of waiting for React to hydrate, which made headlines animate after everything else.
 */
const MOTION_BOOT = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("intro")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script below adds a class to <html> before React hydrates.
    <html lang="en" className={`${brand.variable} ${display.variable} ${sans.variable} ${mono.variable} ${cookie.variable}`} suppressHydrationWarning>
      <head>
        {/* Enables the CSS hero intro before the first paint (see MOTION_BOOT). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display -- icon font: "block" avoids flashing ligature names before it loads */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&display=block" />
      </head>
      <body>
        <ToastProvider>{children}<MotionRoot /><OmniboxPalette /></ToastProvider>
      </body>
    </html>
  );
}
