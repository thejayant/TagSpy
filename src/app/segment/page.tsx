import type { Metadata } from "next";
import { SegmentApp } from "@/components/segment-app";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("segment");

export default async function SegmentPage({ searchParams }: PageProps<"/segment">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from another TagSpy page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return (
    <>
      <StructuredData slug="segment" />
      <SegmentApp key={input ?? ""} initialId={input} guide={<SeoGuide slug="segment" />} />
    </>
  );
}
