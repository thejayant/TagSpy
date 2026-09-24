import type { Metadata } from "next";
import { MetaApp } from "@/components/meta-app";

export const metadata: Metadata = {
  title: "Decode any Meta Pixel",
  description: "See the public configuration behind any Meta Pixel: codeless Event Setup Tool rules, advanced matching fields, Conversions API Gateway, blocked parameters and Meta's rollout flags.",
};

export default async function MetaPage({ searchParams }: PageProps<"/meta">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from the GA4 or Tag Manager page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return <MetaApp key={input ?? ""} initialId={input} />;
}
