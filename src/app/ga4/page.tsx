import type { Metadata } from "next";
import { Ga4App } from "@/components/ga4-app";

export const metadata: Metadata = {
  title: "Audit any GA4 setup from a URL",
  description: "See the GA4 configuration behind any website: enhanced measurement, created and modified events, key events, consent and data collection settings.",
};

export default async function Ga4Page({ searchParams }: PageProps<"/ga4">) {
  const { id } = await searchParams;
  return <Ga4App initialId={typeof id === "string" ? id : undefined} />;
}
