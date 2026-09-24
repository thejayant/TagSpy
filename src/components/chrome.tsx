"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useToast } from "./toast";

export const AUTHOR_URL = "https://thejayant.in";

export function Icon({ name, className = "", fill = false, title }: { name: string; className?: string; fill?: boolean; title?: string }) {
  return <span className={`ms ${fill ? "fill" : ""} ${className}`} aria-hidden={title ? undefined : true} title={title}>{name}</span>;
}

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <Image src="/icon.svg" width={30} height={30} alt="" />
    </span>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const link = (href: string, label: string) => <Link href={href} className={path?.startsWith(href) ? "on" : ""}>{label}</Link>;
  return (
    <header className="nav">
      <div className="nav-inner">
        <div className="brand">
          <Link href="/ga4" className="brand-link" aria-label="TagSpy home"><Logo /></Link>
          <div className="brand-text">
            <Link href="/ga4" className="brand-name">TagSpy</Link>
            <a href={AUTHOR_URL} className="brand-by" target="_blank" rel="noopener">Built by thejayant</a>
          </div>
        </div>
        <nav className="nav-links" aria-label="Main">
          {link("/ga4", "GA4")}
          {link("/gtm", "Tag Manager")}
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
        <p>TagSpy reads only the public, published configuration Google serves to every visitor. Nothing is executed, and no account access is used.</p>
        <div className="footer-row">
          <nav aria-label="Footer">
            <Link href="/ga4">GA4</Link><span>|</span><Link href="/gtm">Tag Manager</Link><span>|</span><Link href="/alerts">Alerts</Link>
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
