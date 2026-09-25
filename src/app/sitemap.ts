import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { GUIDES, TOOL_ORDER } from "@/lib/seo";

/** The landing page and every public tool page, for search engines. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...TOOL_ORDER.map((slug, index) => ({ url: `${base}${GUIDES[slug].path}`, changeFrequency: "weekly" as const, priority: index < 2 ? 0.9 : 0.8 })),
  ];
}
