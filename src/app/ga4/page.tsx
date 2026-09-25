import type { Metadata } from "next";
import { Ga4App } from "@/components/ga4-app";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("ga4");

export default async function Ga4Page({ searchParams }: PageProps<"/ga4">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from the Tag Manager page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return (
    <>
      <StructuredData slug="ga4" />
      <Ga4App key={input ?? ""} initialId={input} guide={<SeoGuide slug="ga4" />} />
    </>
  );
}
