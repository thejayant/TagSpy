import type { Metadata } from "next";
import { GtmApp } from "@/components/gtm-app";

export const metadata: Metadata = {
  title: "Inspect any Google Tag Manager container",
  description: "Rebuild the tags, triggers and variables of any published GTM container, see where data goes, and download it as an import file.",
};

export default async function GtmPage({ searchParams }: PageProps<"/gtm">) {
  const { id, view } = await searchParams;
  return <GtmApp initialId={typeof id === "string" ? id : undefined} initialView={typeof view === "string" ? view : undefined} />;
}
