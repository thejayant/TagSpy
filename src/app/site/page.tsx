import type { Metadata } from "next";
import { SiteApp } from "@/components/site-app";

export const metadata: Metadata = {
  title: "See how any website is built",
  description: "Site DNA: the framework, motion stack, fonts, design tokens, hosting and DNS behind any website, read from its public HTML, JavaScript, CSS and font files.",
};

export default async function SitePage({ searchParams }: PageProps<"/site">) {
  const { url, q, vs } = await searchParams;
  // ?q= carries a searched website over from another TagSpy page.
  const input = typeof url === "string" ? url : typeof q === "string" ? q : undefined;
  const compare = typeof vs === "string" ? vs : undefined;
  return <SiteApp key={`${input ?? ""}|${compare ?? ""}`} initialUrl={input} initialVs={compare} />;
}
