import type { Metadata } from "next";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { SiteApp } from "@/components/site-app";
import { guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("site");

export default async function SitePage({ searchParams }: PageProps<"/site">) {
  const { url, q, vs } = await searchParams;
  // ?q= carries a searched website over from another TagSpy page.
  const input = typeof url === "string" ? url : typeof q === "string" ? q : undefined;
  const compare = typeof vs === "string" ? vs : undefined;
  return (
    <>
      <StructuredData slug="site" />
      <SiteApp key={`${input ?? ""}|${compare ?? ""}`} initialUrl={input} initialVs={compare} guide={<SeoGuide slug="site" />} />
    </>
  );
}
