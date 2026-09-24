"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { brandByName, type Brand } from "@/lib/brands";
import { parseContext, readRaw, subscribe, type ContextMode, type SiteContext } from "@/lib/site-context";
import { useToast } from "./toast";

export const AUTHOR_URL = "https://thejayant.in";

export function Icon({ name, className = "", fill = false, title }: { name: string; className?: string; fill?: boolean; title?: string }) {
  return <span className={`ms ${fill ? "fill" : ""} ${className}`} aria-hidden={title ? undefined : true} title={title}>{name}</span>;
}

/** What each inspected thing is called in copy. */
export const KIND_NOUN: Record<ContextMode, string> = { ga4: "property", gtm: "container", meta: "pixel", segment: "source" };
export const KIND_LABEL: Record<ContextMode, string> = { ga4: "GA4 property", gtm: "Tag Manager container", meta: "Meta Pixel", segment: "Segment source" };

/** A vendor mark on a white glass tile; `large` renders the header-sized app icon. */
export function BrandGlyph({ brand, size = "md" }: { brand: Brand; size?: "xs" | "md" | "large" }) {
  const base = size === "large" ? "app-icon brand" : `glyph brand${size === "xs" ? " xs" : ""}`;
  if (!("logo" in brand)) {
    return <span className={`${base} letter`} style={brand.color ? { ["--tone" as string]: brand.color } : undefined} title={brand.name} aria-label={brand.name} role="img">{brand.letter}</span>;
  }
  return (
    <span className={base} style={brand.logo.tile ? { background: brand.logo.tile } : undefined} title={brand.name} aria-label={brand.name} role="img">
      {/* Static, committed SVG markup from BRAND_LOGOS (never user input). */}
      <svg viewBox={brand.logo.viewBox} aria-hidden="true" dangerouslySetInnerHTML={{ __html: brand.logo.body }} />
    </span>
  );
}

const PRODUCT = { ga4: brandByName("Google Analytics")!, gtm: brandByName("Google Tag Manager")!, meta: brandByName("Meta Pixel")!, segment: brandByName("Segment")! };

/** Google Analytics, Tag Manager, Meta or Segment mark for a property, container, pixel or source. */
export function ProductGlyph({ kind, size }: { kind: ContextMode; size?: "xs" | "md" | "large" }) {
  return <BrandGlyph brand={PRODUCT[kind]} size={size} />;
}

/** One-click jumps between the GA4 properties, Tag Manager containers and Meta pixels of the same site. */
export function RelatedLinks({ title, items }: { title: string; items: { kind: ContextMode; id: string }[] }) {
  if (!items.length) return null;
  return (
    <nav className="related" aria-label={title}>
      <span className="related-title">{title}</span>
      <div className="related-items">
        {items.map((item) => (
          <Link key={item.id} href={`/${item.kind}?id=${encodeURIComponent(item.id)}`} className="related-item">
            <ProductGlyph kind={item.kind} size="xs" />
            <code>{item.id}</code>
            <Icon name="arrow_forward" className="xs" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** The TagSpy wordmark: live text, "tag" in ink and "spy" in the refraction gradient, with a pulsing live dot. */
export function Wordmark({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <span className={`wordmark ${size}`} aria-label="TagSpy">
      <span className="wm-tag" aria-hidden="true">tag</span>
      <span className="wm-spy" aria-hidden="true">spy</span>
      <span className="wm-dot" aria-hidden="true" />
    </span>
  );
}

/** The current investigation (searched site and IDs found), shared by the GA4, Tag Manager and Meta pages. */
export function useSiteContext(): SiteContext {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  return useMemo(() => parseContext(raw), [raw]);
}

export function SiteHeader() {
  const path = usePathname();
  // Plain section links: carrying the current site or IDs is left to the in-page mode switch and "Switch to" links.
  const link = (href: "/ga4" | "/gtm" | "/meta" | "/segment" | "/alerts", label: string, short?: string) => {
    const on = !!path?.startsWith(href);
    return <Link href={href} className={on ? "on" : ""}>{short ? <><span className="label-long">{label}</span><span className="label-short" aria-hidden="true">{short}</span></> : label}</Link>;
  };
  return (
    <header className="nav">
      <div className="nav-inner">
        <div className="brand">
          <div className="brand-text">
            <Link href="/ga4" className="brand-link" aria-label="TagSpy home"><Wordmark /></Link>
            <a href={AUTHOR_URL} className="brand-by" target="_blank" rel="noopener">Built by thejayant</a>
          </div>
        </div>
        <nav className="nav-links" aria-label="Main">
          {link("/ga4", "GA4")}
          {link("/gtm", "Tag Manager", "GTM")}
          {link("/meta", "Meta")}
          {link("/segment", "Segment")}
          {link("/alerts", "Alerts")}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <Wordmark size="sm" />
        <p>TagSpy reads only the public, published configuration that Google, Meta and Segment serve to every visitor. Nothing is executed, and no account access is used.</p>
        <div className="footer-row">
          <nav aria-label="Footer">
            <Link href="/ga4">GA4</Link><span>|</span><Link href="/gtm">Tag Manager</Link><span>|</span><Link href="/meta">Meta</Link><span>|</span><Link href="/segment">Segment</Link><span>|</span><Link href="/alerts">Alerts</Link>
          </nav>
          <p>Designed and built by <a href={AUTHOR_URL} target="_blank" rel="noopener">thejayant</a> · <a href={AUTHOR_URL} target="_blank" rel="noopener">thejayant.in</a></p>
        </div>
      </div>
    </footer>
  );
}

export function useShare() {
  const toast = useToast();
  return async (url: string, title: string) => {
    try {
      if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url, title });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied", "Anyone with this link can open the same report.");
    } catch {
      toast("Couldn't copy the link", url);
    }
  };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Read-only iOS-style switch. */
export function Switch({ on, small = false, label }: { on: boolean; small?: boolean; label?: string }) {
  return <span className={`switch ${on ? "on" : ""} ${small ? "sm" : ""}`} role="img" aria-label={label ? `${label}: ${on ? "on" : "off"}` : on ? "On" : "Off"} />;
}
