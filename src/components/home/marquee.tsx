"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { TECH_ICONS } from "@/lib/site/tech-icons";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/** Technologies Site DNA recognises, shown as two belts of real logos running in opposite directions. */
const ROWS: string[][] = [
  ["Next.js", "React", "Vue.js", "Svelte", "Astro", "Nuxt", "Remix", "Angular", "Gatsby", "Vite", "Turbopack", "webpack", "TypeScript", "Tailwind CSS", "shadcn/ui", "Radix UI", "Material UI", "Bootstrap", "Sass", "GSAP", "Framer Motion", "three.js"],
  ["WordPress", "Webflow", "Framer", "Shopify", "Wix", "Squarespace", "Ghost", "Sanity", "Contentful", "Strapi", "Vercel", "Netlify", "Cloudflare", "Fastly", "Google Analytics", "Google Tag Manager", "Meta Pixel", "Segment", "Hotjar", "Stripe", "Supabase", "Sentry"],
];

/**
 * Each belt loops seamlessly (its content is doubled and shifted by half). Scrolling speeds the belts up in the
 * scroll direction, then they ease back to their idle pace.
 */
export function TechMarquee() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const belts = gsap.utils.toArray<HTMLElement>(".mq-track", section).map((track, index) =>
      gsap.fromTo(track, { xPercent: index % 2 ? -50 : 0 }, { xPercent: index % 2 ? 0 : -50, duration: 48 + index * 8, ease: "none", repeat: -1 }));
    let settle: gsap.core.Tween | null = null;
    const trigger = ScrollTrigger.create({
      trigger: section, start: "top bottom", end: "bottom top",
      onToggle: (self) => belts.forEach((belt) => (self.isActive ? belt.resume() : belt.pause())),
      onUpdate: (self) => {
        const boost = gsap.utils.clamp(1, 7, 1 + Math.abs(self.getVelocity()) / 250);
        const direction = self.direction;
        belts.forEach((belt) => belt.timeScale(boost * direction));
        settle?.kill();
        settle = gsap.to(belts, { timeScale: direction, duration: 1.2, ease: "power2.out", delay: 0.05 });
      },
    });
    return () => { trigger.kill(); settle?.kill(); belts.forEach((belt) => belt.kill()); };
  }, []);

  return (
    <div ref={root} className="mq" aria-label="Some of the technologies TagSpy recognises">
      {ROWS.map((row, index) => (
        <div className="mq-belt" key={index}>
          <div className="mq-track">
            {[...row, ...row].map((name, item) => {
              const file = TECH_ICONS[name];
              return (
                <span className="mq-item" key={`${name}-${item}`} aria-hidden={item >= row.length ? true : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG marks */}
                  {file ? <img src={`/tech-icons/${file}`} alt="" loading="lazy" decoding="async" /> : null}
                  {name}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
