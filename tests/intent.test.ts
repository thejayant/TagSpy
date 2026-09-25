import { describe, expect, it } from "vitest";
import { findSite, understand } from "@/lib/intent";

const top = (query: string) => understand(query)?.suggestions[0];

describe("omnibox intent", () => {
  it("asks what to do with a bare website, starting with the free tools", () => {
    const result = understand("stripe.com")!;
    expect(result.target).toMatchObject({ type: "site", host: "stripe.com" });
    expect(result.headline).toBe("What should we spy on stripe.com?");
    expect(result.suggestions.map((item) => item.tool)).toEqual(["site", "ai", "gtm", "ga4", "meta", "segment"]);
    // The one-run AI check is never the default for a bare address.
    expect(result.suggestions[0].tool).not.toBe("ai");
  });

  it("reads what people ask for around the address", () => {
    expect(top("is linear.app built with AI?")).toMatchObject({ tool: "ai", href: "/ai-website-detector?url=linear.app", reason: "You asked about “built with ai”" });
    expect(top("what fonts does apple.com use")?.tool).toBe("site");
    expect(top("facebook pixel on nike.com")?.tool).toBe("meta");
    expect(top("https://www.shopify.com/pricing gtm tags")).toMatchObject({ tool: "gtm", href: "/gtm?q=www.shopify.com%2Fpricing" });
    expect(top("what does allbirds.com track")?.tool).toBe("gtm");
    expect(top("segment destinations of segment.com")?.tool).toBe("segment");
  });

  it("never reads intent from the address itself", () => {
    // "ai" inside a domain, "gtm" inside a domain.
    expect(top("mail.ai")?.tool).toBe("site");
    expect(top("gtm.example.org")?.tool).toBe("site");
  });

  it("routes tag IDs straight to their tool", () => {
    expect(understand("GTM-N233G8C")!.headline).toBe("GTM-N233G8C is a Tag Manager container.");
    expect(top("gtm-n233g8c")).toMatchObject({ tool: "gtm", href: "/gtm?id=GTM-N233G8C" });
    expect(top("G-6SET8QZ3TV")).toMatchObject({ tool: "ga4", href: "/ga4?id=G-6SET8QZ3TV" });
    expect(top("1234567890123456")?.tool).toBe("meta");
    // A container can also be searched for the GA4 tags and pixels inside it.
    expect(understand("meta pixel in GTM-N233G8C")!.suggestions[0].tool).toBe("meta");
  });

  it("finds every ID in pasted page source", () => {
    const html = `<!doctype html><html><head><link rel="canonical" href="https://shop.example.com/"><script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABCD123');gtag('config','G-ABCDEF1234');fbq('init', '123456789012345');</script></head><body></body></html>`;
    const result = understand(html)!;
    expect(result.target?.type).toBe("source");
    expect(result.suggestions.map((item) => item.tool)).toEqual(["gtm", "ga4", "meta", "site"]);
    expect(result.suggestions.at(-1)?.href).toBe("/site?url=shop.example.com");
  });

  it("guesses a .com for a brand name, and points questions at the right tool", () => {
    expect(understand("notion")).toMatchObject({ headline: "Did you mean notion.com?", target: { guessed: true } });
    const question = understand("check facebook pixel")!;
    expect(question.target).toBeNull();
    expect(question.suggestions[0]).toMatchObject({ tool: "meta", href: "/meta" });
    expect(understand("hello there")!.suggestions).toEqual([]);
  });

  it("ignores file names that look like domains", () => {
    expect(findSite("next.js")).toBeNull();
    expect(findSite("analytics.js on example.com")?.host).toBe("example.com");
  });
});
