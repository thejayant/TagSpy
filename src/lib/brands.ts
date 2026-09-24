import { BRAND_LOGOS, type BrandLogo } from "./brand-logos";
import { TAG_TYPES } from "./gtm/catalog";

/** A vendor's real logo, or a letter badge in its color when no open-licensed mark exists. */
export type Brand = { name: string; logo: BrandLogo } | { name: string; letter: string; color?: string };

/** Vendor, tag group and tag type names (as produced by the GTM parser) mapped to logo keys. */
const LOGO_BY_NAME: Record<string, string> = {
  "Google Analytics": "google-analytics",
  "Google Tag Manager": "google-tag-manager",
  "Google Ads": "google-ads",
  "Google": "google",
  "Google Optimize": "google-optimize",
  "Google AdSense": "google-adsense",
  "Floodlight": "google-marketing-platform",
  "Meta Pixel": "meta",
  "Microsoft Advertising": "bing",
  "Microsoft Ads UET": "bing",
  "Microsoft Clarity": "microsoft",
  "LinkedIn": "linkedin",
  "LinkedIn Insight": "linkedin",
  "Hotjar": "hotjar",
  "Pinterest": "pinterest",
  "TikTok Pixel": "tiktok",
  "X / Twitter": "x",
  "Snap Pixel": "snapchat",
  "Reddit Pixel": "reddit",
  "HubSpot": "hubspot",
  "Intercom": "intercom",
  "Matomo": "matomo",
  "Segment": "segment",
  "Mixpanel": "mixpanel",
  "Amplitude": "amplitude",
  "Heap": "heap",
  "Quora": "quora",
  "Quora Pixel": "quora",
  "AdRoll": "adroll",
  "Zendesk": "zendesk",
  "Mailchimp": "mailchimp",
  "Shopify": "shopify",
  "PostHog": "posthog",
  "Optimizely": "optimizely",
  "Salesforce Pardot": "salesforce",
  "WhatsApp": "whatsapp",
  "Typeform": "typeform",
  "Plausible": "plausible",
  "YouTube": "youtube",
};

const LETTER_BY_NAME: Record<string, { letter: string; color?: string }> = {
  "Criteo": { letter: "C", color: "#FE5000" },
  "Yandex Metrica": { letter: "Y", color: "#FC3F1D" },
  "Taboola": { letter: "T" },
  "Outbrain": { letter: "O" },
  "Klaviyo": { letter: "K" },
  "VWO": { letter: "V" },
  "Drift": { letter: "D" },
  "Tawk.to": { letter: "T" },
  "Crisp": { letter: "C" },
};

const GROUP_BY_TYPE = new Map(Object.values(TAG_TYPES).flatMap((info) => [[info.name, info.group], ...(info.short ? [[info.short, info.group]] : [])] as [string, string][]));

export function brandByName(name: string | undefined): Brand | undefined {
  if (!name) return undefined;
  const key = LOGO_BY_NAME[name];
  if (key && BRAND_LOGOS[key]) return { name, logo: BRAND_LOGOS[key] };
  const letter = LETTER_BY_NAME[name];
  return letter ? { name, ...letter } : undefined;
}

/** The most specific brand for a tag: detected vendor first, then its group, then its type's group. */
export function brandForTag(tag: { vendor?: string; group?: string; type?: string }): Brand | undefined {
  return brandByName(tag.vendor) ?? brandByName(tag.group) ?? brandByName(tag.type ? GROUP_BY_TYPE.get(tag.type) : undefined);
}
