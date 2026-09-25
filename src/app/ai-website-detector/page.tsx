import type { Metadata } from "next";
import { AiDetectorApp } from "@/components/ai-detector";
import { FAQ } from "@/lib/ai/content";
import { appUrl } from "@/lib/env";

const TITLE = "AI Website Detector: Was This Website Built With AI?";
const DESCRIPTION = "Free AI website detector. Check if a website was built with AI tools like Lovable, Bolt, v0, Replit, Claude Code or Cursor, see the likelihood as a percentage, and every piece of evidence in its code.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["AI website detector", "is this website AI generated", "AI generated website checker", "was this site built with AI", "Lovable detector", "vibe coded website checker", "AI built website"],
  alternates: { canonical: "/ai-website-detector" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/ai-website-detector", type: "website", siteName: "TagSpy" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/** Structured data: the tool itself, and the FAQ shown on the page (eligible for FAQ rich results). */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "AI Website Detector",
      url: `${appUrl()}/ai-website-detector`,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      creator: { "@type": "Person", name: "thejayant", url: "https://thejayant.in" },
    },
    { "@type": "FAQPage", mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) },
  ],
};

export default async function AiDetectorPage({ searchParams }: PageProps<"/ai-website-detector">) {
  const { url } = await searchParams;
  return (
    <>
      {/* Static, server-built JSON; "<" is escaped so the content can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* A shared link only fills in the address: with one free check, a check never starts on its own. */}
      <AiDetectorApp initialUrl={typeof url === "string" ? url : undefined} />
    </>
  );
}
