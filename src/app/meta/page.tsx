import type { Metadata } from "next";
import { MetaApp } from "@/components/meta-app";
import { SeoGuide, StructuredData } from "@/components/seo-guide";
import { guideMetadata } from "@/lib/seo";

export const metadata: Metadata = guideMetadata("meta");

export default async function MetaPage({ searchParams }: PageProps<"/meta">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from the GA4 or Tag Manager page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return (
    <>
      <StructuredData slug="meta" />
      <MetaApp key={input ?? ""} initialId={input} guide={<SeoGuide slug="meta" />} />
    </>
  );
}
