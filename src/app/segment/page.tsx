import type { Metadata } from "next";
import { SegmentApp } from "@/components/segment-app";

export const metadata: Metadata = {
  title: "Map any Segment stack",
  description: "See every tool a website sends data to through Segment: destinations, browser or server mode, tracking plan, consent categories, routing rules and a data governance score.",
};

export default async function SegmentPage({ searchParams }: PageProps<"/segment">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from another TagSpy page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return <SegmentApp key={input ?? ""} initialId={input} />;
}
