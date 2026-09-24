import type { Metadata } from "next";
import { Ga4App } from "@/components/ga4-app";

export const metadata: Metadata = {
  title: "Audit any GA4 setup from a URL",
  description: "See the GA4 configuration behind any website: enhanced measurement, created and modified events, key events, consent and data collection settings.",
};

export default async function Ga4Page({ searchParams }: PageProps<"/ga4">) {
  const { id, q } = await searchParams;
  // ?q= carries a searched website over from the Tag Manager page.
  const input = typeof id === "string" ? id : typeof q === "string" ? q : undefined;
  return <Ga4App key={input ?? ""} initialId={input} />;
}
