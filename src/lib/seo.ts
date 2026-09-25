import type { Metadata } from "next";

/**
 * Search content for every public page: titles aimed at what people search for, a visible guide (what the tool shows,
 * how it works, questions) and matching structured data. One source, so the page text, the FAQ rich results and the
 * sitemap never drift apart.
 */

export type GuideSlug = "home" | "ga4" | "gtm" | "meta" | "segment" | "site" | "ai";

export interface Guide {
  slug: GuideSlug;
  path: string;
  /** Short product name, used in links between tools. */
  name: string;
  /** One line for cards and link lists. */
  tagline: string;
  icon: string;
  title: string;
  description: string;
  keywords: string[];
  /** The guide's own heading and opening paragraph. */
  heading: string;
  lede: string;
  features: { icon: string; title: string; text: string }[];
  steps: { title: string; text: string }[];
  faq: { q: string; a: string }[];
}

const INPUT_NOTE = "Nothing is installed, no login is needed, and nothing you check is stored.";

export const GUIDES: Record<GuideSlug, Guide> = {
  home: {
    slug: "home", path: "/", name: "TagSpy", tagline: "Free website inspector", icon: "travel_explore",
    title: "TagSpy: Free Website Inspector for GA4, GTM, Meta Pixel, Tech Stack & AI Detection",
    description: "Inspect any website for free: its GA4 setup, Google Tag Manager container, Meta Pixel, Segment destinations, technology stack and fonts, and whether it was built with AI. No login, nothing stored.",
    keywords: ["website inspector", "website analyzer", "check website tracking", "GA4 checker", "GTM viewer", "website technology checker", "AI website detector"],
    heading: "Everything a website shows the world, in one place",
    lede: "Every website sends its analytics tags, tag manager container, pixels and code to every visitor's browser. TagSpy reads those public files and turns them into clear reports, so marketers, developers and analysts can audit a site, learn from a competitor or debug their own setup in seconds.",
    features: [
      { icon: "query_stats", title: "Tracking audits", text: "GA4 events and key events, every tag and trigger in a GTM container, Meta Pixel rules and Segment destinations." },
      { icon: "deployed_code", title: "Tech stack", text: "Frameworks, CMS, hosting, animation libraries, fonts and design tokens, read from the site's own files." },
      { icon: "neurology", title: "AI detection", text: "How likely it is that a site was built with Lovable, Bolt, v0, Replit or a coding agent, with the evidence." },
      { icon: "lock", title: "Private by design", text: "Only public responses are read. Reports live in your tab and are never stored on our servers." },
    ],
    steps: [
      { title: "Enter a website or an ID", text: "Any address works, or a GA4 Measurement ID, GTM container ID, pixel ID or Segment write key." },
      { title: "We read the public files", text: "The same HTML, scripts and configurations your browser downloads when you visit." },
      { title: "Get a clear report", text: "Plain-language findings, the evidence behind each one, and exports where they help." },
    ],
    faq: [
      { q: "Is TagSpy free?", a: "Yes. Every inspector is free and needs no account. The AI Website Detector includes one free check per person, because each check runs a real browser in the cloud." },
      { q: "Is it legal to inspect another website's tags?", a: "TagSpy reads only what a website publicly sends to every visitor: its HTML, JavaScript and the tag configurations Google, Meta and Segment serve. Nothing private is accessed and no account is used." },
      { q: "Do you store the sites I check?", a: "No. Reports exist only in the response to you and in your browser tab. Nothing about the sites you check is kept on our servers." },
      { q: "What can I use TagSpy for?", a: "Auditing your own analytics before a launch, checking what a client or competitor tracks, finding the GTM container behind a site, identifying the fonts and framework a site uses, and checking whether a site was built with AI." },
    ],
  },
  ga4: {
    slug: "ga4", path: "/ga4", name: "GA4 Checker", tagline: "See any site's Google Analytics 4 setup", icon: "query_stats",
    title: "GA4 Checker: See Any Website's Google Analytics 4 Setup",
    description: "Free GA4 checker. Enter a website or Measurement ID to see its Google Analytics 4 setup: enhanced measurement, key events, created and modified events, consent mode and data settings.",
    keywords: ["GA4 checker", "Google Analytics 4 checker", "check GA4 tag", "find GA4 measurement ID", "GA4 audit tool", "GA4 tag inspector", "enhanced measurement checker"],
    heading: "Audit any Google Analytics 4 setup from a URL",
    lede: "GA4's configuration is not a secret: the Google tag (gtag.js) every visitor downloads carries the property's settings. The GA4 checker finds the Measurement ID behind a site and decodes that tag into a readable audit, so you can verify a setup without access to the property.",
    features: [
      { icon: "bolt", title: "Enhanced measurement", text: "Which automatic events are on: page views, scrolls, outbound clicks, site search, video and file downloads." },
      { icon: "flag", title: "Key events", text: "Events marked as key events (conversions) and the created and modified event rules behind them." },
      { icon: "shield", title: "Consent & privacy", text: "Consent mode defaults, Google signals, ads personalisation and data collection settings." },
      { icon: "alt_route", title: "Traffic rules", text: "Cross-domain domains, internal traffic rules, unwanted referrals, session timeout and data redaction." },
    ],
    steps: [
      { title: "Enter a site or a G- ID", text: "Type any website, or a GA4 Measurement ID like G-XXXXXXXXXX or a Google tag ID (GT-)." },
      { title: "We find and read the tag", text: "TagSpy locates the Google tags on the page and downloads the published gtag.js for each." },
      { title: "Read the audit", text: "Events, key events, consent and settings, each explained in plain language." },
    ],
    faq: [
      { q: "How do I find a website's GA4 Measurement ID?", a: "Enter the website in the GA4 checker. TagSpy scans the page and its tag manager container for G- and GT- IDs and lists every Google tag it finds, then opens the one you choose." },
      { q: "Can I see another website's GA4 events?", a: "You can see the events configured in its Google tag: enhanced measurement, created events, modified events and key events. Events sent only from custom code or the server are not visible in the tag." },
      { q: "How do I check if GA4 is installed correctly?", a: "Run your own site through the checker. If no Google tag is found, GA4 isn't loading; if it is, the report shows which events and consent settings are live." },
      { q: "Does the GA4 checker need access to my Analytics account?", a: `No. It reads the public Google tag every visitor downloads. ${INPUT_NOTE}` },
    ],
  },
  gtm: {
    slug: "gtm", path: "/gtm", name: "GTM Viewer", tagline: "Open any Google Tag Manager container", icon: "sell",
    title: "GTM Container Viewer: See Any Website's Google Tag Manager Tags",
    description: "Free Google Tag Manager viewer. Open any published GTM container to see every tag, trigger and variable, where data is sent, and export it as an import file.",
    keywords: ["GTM container viewer", "Google Tag Manager viewer", "view GTM container", "GTM inspector", "export GTM container", "see website tags", "GTM tag checker"],
    heading: "Open any Google Tag Manager container",
    lede: "A published GTM container is a JavaScript file (gtm.js) that every visitor loads. It holds every tag, trigger and variable in compiled form. The GTM viewer rebuilds it into the structure you know from Tag Manager, shows where each tag sends data, and lets you export it.",
    features: [
      { icon: "sell", title: "Every tag", text: "Google Analytics, Google Ads, Meta, TikTok, LinkedIn, custom HTML and more, with their settings and IDs." },
      { icon: "bolt", title: "Triggers & variables", text: "Firing rules rebuilt from the compiled container, plus data layer, DOM and JavaScript variables." },
      { icon: "hub", title: "Where data goes", text: "A map of the platforms the container sends data to, and the IDs of each destination." },
      { icon: "download", title: "Export", text: "Download the container as a GTM import file to reuse a setup or compare versions." },
    ],
    steps: [
      { title: "Enter a site or a GTM- ID", text: "Type any website, or a container ID like GTM-XXXXXXX." },
      { title: "We read the published container", text: "TagSpy downloads the live gtm.js from Google and decodes its tags, triggers and variables." },
      { title: "Explore and export", text: "Browse by tag, trigger or destination, and download an import file." },
    ],
    faq: [
      { q: "How can I see which tags a website uses in Google Tag Manager?", a: "Enter the website in the GTM viewer. TagSpy finds its GTM- container ID and rebuilds the published container, listing every tag, trigger and variable." },
      { q: "Can I export another website's GTM container?", a: "You can download the published container as a GTM import file. It reflects what is live, rebuilt from the compiled file, so names of triggers and variables may differ from the original workspace." },
      { q: "How do I find a website's GTM container ID?", a: "Enter the site; TagSpy looks in the HTML and scripts for GTM- IDs and lists each container it finds." },
      { q: "Does this need access to the Tag Manager account?", a: `No. It reads the public container file Google serves to every visitor. ${INPUT_NOTE}` },
    ],
  },
  meta: {
    slug: "meta", path: "/meta", name: "Meta Pixel Checker", tagline: "Decode any Facebook / Meta Pixel", icon: "ads_click",
    title: "Meta Pixel Checker: Inspect Any Website's Facebook Pixel Setup",
    description: "Free Meta Pixel checker. Enter a website or pixel ID to see its Facebook Pixel setup: codeless event rules, automatic advanced matching, Conversions API Gateway, blocked parameters and a setup score.",
    keywords: ["Meta pixel checker", "Facebook pixel checker", "Facebook pixel helper online", "check Facebook pixel", "Meta pixel inspector", "advanced matching checker", "Conversions API checker"],
    heading: "Decode any Meta Pixel",
    lede: "Every page with a Meta (Facebook) Pixel downloads that pixel's configuration from Meta. It contains the codeless events set up in Events Manager, the customer data sent for advanced matching, server-side settings and restrictions. The Meta Pixel checker reads it and scores the setup.",
    features: [
      { icon: "touch_app", title: "Codeless events", text: "Event Setup Tool rules: which clicks and page visits fire which standard events." },
      { icon: "person_search", title: "Advanced matching", text: "Which customer fields (email, phone, name) the pixel sends to improve matching." },
      { icon: "dns", title: "Server-side", text: "Conversions API Gateway and first-party setups found in the configuration." },
      { icon: "grade", title: "Setup score", text: "A 0–100 score with the biggest improvements to make next." },
    ],
    steps: [
      { title: "Enter a site or a pixel ID", text: "Type any website, a GTM container, or a numeric pixel ID." },
      { title: "We fetch the pixel config", text: "TagSpy finds the pixel and downloads its public configuration from Meta." },
      { title: "Read the score", text: "Rules, matching fields, restrictions and a prioritised list of fixes." },
    ],
    faq: [
      { q: "How do I check if a website has a Facebook Pixel?", a: "Enter the website in the Meta Pixel checker. TagSpy finds any pixel on the page or inside its Google Tag Manager container and opens its configuration." },
      { q: "Is this like the Meta Pixel Helper extension?", a: "It answers similar questions without installing anything, and goes further: it reads the pixel's configuration directly, including codeless rules and advanced matching fields the extension doesn't list." },
      { q: "Can I see another site's Conversions API setup?", a: "When the pixel's configuration shows a Conversions API Gateway or a first-party endpoint, the checker reports it. Server-to-server events sent by a backend are not visible to anyone outside." },
      { q: "Do I need access to Events Manager?", a: `No. The configuration is public: Meta serves it to every visitor's browser. ${INPUT_NOTE}` },
    ],
  },
  segment: {
    slug: "segment", path: "/segment", name: "Segment Inspector", tagline: "Map any Segment stack", icon: "hub",
    title: "Segment Inspector: See Every Destination a Website Sends Data To",
    description: "Free Segment inspector. Enter a website or write key to see its Segment source: every destination, browser or server mode, tracking plan, consent categories, routing rules and a governance score.",
    keywords: ["Segment inspector", "Segment destinations checker", "Segment write key", "analytics.js inspector", "CDP audit tool", "Segment tracking plan"],
    heading: "Map any Segment stack",
    lede: "Websites that use Segment load their source settings from Segment's CDN. Those settings list every destination the data flows to, how it is sent and which consent rules apply. The Segment inspector lays them out as a map of the site's customer data stack.",
    features: [
      { icon: "hub", title: "Every destination", text: "Analytics, ads, CRM and warehouse tools, in browser or server mode." },
      { icon: "rule", title: "Tracking plan", text: "Protocols tracking plan settings and how unplanned events are handled." },
      { icon: "cookie", title: "Consent", text: "Consent categories and which destinations each one gates." },
      { icon: "grade", title: "Governance score", text: "How well the data flow is controlled, with the next improvements to make." },
    ],
    steps: [
      { title: "Enter a site or a write key", text: "Type any website, or a Segment write key." },
      { title: "We read the source settings", text: "TagSpy downloads the public settings file Segment serves to the site's visitors." },
      { title: "See the data map", text: "Destinations, consent gates, routing rules and a score." },
    ],
    faq: [
      { q: "How do I see which tools a website sends data to with Segment?", a: "Enter the website in the Segment inspector. It finds the write key on the page and lists every destination in the source's settings." },
      { q: "Is a Segment write key secret?", a: "No. The write key is embedded in the website so browsers can send events; it identifies the source and cannot read data." },
      { q: "Does this show server-side destinations?", a: "It shows destinations listed in the source's public settings. Destinations added only to server-side sources or reverse ETL are not visible from outside." },
      { q: "Do I need Segment workspace access?", a: `No. ${INPUT_NOTE}` },
    ],
  },
  site: {
    slug: "site", path: "/site", name: "Site DNA", tagline: "See how any website is built", icon: "travel_explore",
    title: "Website Technology Checker: See How Any Website Is Built",
    description: "Free website technology checker. See what any site is built with: framework, CMS, hosting, animation libraries, fonts (with foundry and license), colors, design tokens, DNS and security headers.",
    keywords: ["what is this website built with", "website technology checker", "website tech stack checker", "BuiltWith alternative", "Wappalyzer alternative", "what font is this website using", "website font finder", "website color palette"],
    heading: "See how any website is built",
    lede: "Site DNA reads a website the way a browser does: its HTML, every JavaScript bundle, stylesheets, font files, headers and DNS. From those it identifies more than 230 technologies with versions and evidence, opens the font files to name the typeface and foundry, and extracts the design system.",
    features: [
      { icon: "deployed_code", title: "Tech stack", text: "Framework, CMS or site builder, build tool, UI kit, hosting, CDN and third-party services, with versions." },
      { icon: "animation", title: "Motion & 3D", text: "GSAP, Framer Motion, Lenis, three.js and WebGL, page transitions, and whether reduced motion is respected." },
      { icon: "match_case", title: "Fonts", text: "Every typeface with weights, foundry, designer, license and the writing systems it covers." },
      { icon: "palette", title: "Design tokens", text: "Color palette with variable names, type scale, fluid type, radii, breakpoints and dark mode." },
    ],
    steps: [
      { title: "Enter a website", text: "Any public address, or paste a page's source if the site blocks automated visitors." },
      { title: "We read its files", text: "HTML, up to about 48 scripts, stylesheets, font files, source maps, headers and DNS. Nothing is executed." },
      { title: "Go deeper", text: "Run a deep scan to render the page in a real browser for live versions, WebGL and Web Vitals, or compare two sites." },
    ],
    faq: [
      { q: "How can I tell what a website is built with?", a: "Enter the site in Site DNA. It identifies the framework, CMS, hosting and libraries from the site's own files, and shows the evidence for each, like the file and the matched code." },
      { q: "How do I find out what font a website uses?", a: "Site DNA opens the site's font files and reads the real family name, foundry, designer and license, along with every weight the site loads and where the font comes from (Google Fonts, Adobe Fonts or self-hosted)." },
      { q: "Is Site DNA an alternative to BuiltWith or Wappalyzer?", a: "Yes, for single sites: it detects technologies with versions and evidence, and adds what those tools don't show, such as fonts from their files, design tokens, motion libraries and a real-browser deep scan." },
      { q: "Can I compare two websites?", a: "Yes. Compare puts two sites side by side: their stacks, motion, typefaces and palettes." },
    ],
  },
  ai: {
    slug: "ai", path: "/ai-website-detector", name: "AI Website Detector", tagline: "Was this site built with AI?", icon: "neurology",
    title: "AI Website Detector: Was This Website Built With AI?",
    description: "Free AI website detector. Check if a website was built with AI tools like Lovable, Bolt, v0, Replit, Claude Code or Cursor, see the likelihood as a percentage, and every piece of evidence in its code.",
    keywords: ["AI website detector", "is this website AI generated", "AI generated website checker", "was this site built with AI", "Lovable detector", "vibe coded website checker"],
    heading: "", lede: "", features: [], steps: [], faq: [],
  },
};

/** The tools in the order they're offered around the site. */
export const TOOL_ORDER: GuideSlug[] = ["ai", "site", "ga4", "gtm", "meta", "segment"];

/** Page metadata from a guide: absolute title, canonical URL without query strings, social cards. */
export function guideMetadata(slug: GuideSlug): Metadata {
  const guide = GUIDES[slug];
  return {
    title: { absolute: guide.title },
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical: guide.path },
    openGraph: { title: guide.title, description: guide.description, url: guide.path, type: "website", siteName: "TagSpy" },
    twitter: { card: "summary_large_image", title: guide.title, description: guide.description },
  };
}

/** schema.org graph: the tool as a free web application, its FAQ, and the breadcrumb trail. */
export function guideJsonLd(slug: GuideSlug, base: string) {
  const guide = GUIDES[slug];
  const url = `${base}${guide.path === "/" ? "" : guide.path}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": slug === "home" ? "WebSite" : "WebApplication",
      name: slug === "home" ? "TagSpy" : guide.name,
      url,
      description: guide.description,
      ...(slug === "home" ? {} : { applicationCategory: "DeveloperApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }),
      creator: { "@type": "Person", name: "thejayant", url: "https://thejayant.in" },
    },
  ];
  if (guide.faq.length) graph.push({ "@type": "FAQPage", mainEntity: guide.faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) });
  if (slug !== "home") graph.push({ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "TagSpy", item: base }, { "@type": "ListItem", position: 2, name: guide.name, item: url }] });
  return { "@context": "https://schema.org", "@graph": graph };
}
