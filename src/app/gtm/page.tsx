import type { Metadata } from "next";
import { GtmApp } from "@/components/gtm-app";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("gtm");

export default async function GtmPage({ searchParams }: PageProps<"/gtm">) {
  const { id, q, view } = await searchParams;
  // ?q= carries a searched website over from the GA4 page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return (
    <>
      <StructuredData slug="gtm" />
      <GtmApp key={input ?? ""} initialId={input} initialView={typeof view === "string" ? view : undefined} guide={<SeoGuide slug="gtm" />} />
    </>
  );
}
