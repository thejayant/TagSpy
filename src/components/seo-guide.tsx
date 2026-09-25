import Link from "next/link";
import { appUrl } from "@/lib/env";
import { GUIDES, TOOL_ORDER, guideJsonLd, type GuideSlug } from "@/lib/seo";
import { Icon } from "./chrome";

/**
 * The search-friendly half of every tool page: what the tool shows, how it works, questions people ask, and links to
 * the other tools. A server component, so all of it is in the HTML crawlers read; the motion engine reveals it as it
 * scrolls into view.
 */
export function SeoGuide({ slug }: { slug: GuideSlug }) {
  const guide = GUIDES[slug];
  const id = `guide-${slug}`;
  return (
    <section className="guide" aria-labelledby={id}>
      <header className="guide-head">
        <p className="guide-kicker mono">{slug === "home" ? "Why TagSpy" : `About the ${guide.name}`}</p>
        <h2 id={id}>{guide.heading}</h2>
        <p>{guide.lede}</p>
      </header>

      <div className="guide-grid">
        {guide.features.map((feature) => (
          <article className="guide-card glass" key={feature.title}>
            <span className="guide-card-icon"><Icon name={feature.icon} fill /></span>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </div>

      <div className="guide-block">
        <h2 className="guide-h">How it works</h2>
        <ol className="guide-steps">
          {guide.steps.map((step, index) => (
            <li className="guide-step glass" key={step.title}>
              <span className="guide-step-num mono">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="guide-block">
        <h2 className="guide-h">Questions</h2>
        <div className="guide-faq">
          {guide.faq.map((item) => (
            <details className="glass" key={item.q}>
              <summary>{item.q}<Icon name="add" className="guide-faq-icon" /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {slug !== "home" && <ToolLinks slug={slug} />}
    </section>
  );
}

/** Links to the other tools: internal links with descriptive anchor text, which help both visitors and crawlers. */
export function ToolLinks({ slug }: { slug: GuideSlug }) {
  const others = TOOL_ORDER.filter((item) => item !== slug).map((item) => GUIDES[item]);
  return (
    <nav className="guide-block" aria-label="More free tools">
      <h2 className="guide-h">More free tools</h2>
      <div className="guide-links">
        {others.map((other) => (
          <Link href={other.path} key={other.slug} className="glass">
            <span className="guide-link-icon"><Icon name={other.icon} fill /></span>
            <span><strong>{other.name}</strong><small>{other.tagline}</small></span>
            <Icon name="arrow_forward" className="guide-link-arrow" />
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** schema.org data for a page (tool, FAQ and breadcrumbs). "<" is escaped so the JSON can never end the script tag. */
export function StructuredData({ slug }: { slug: GuideSlug }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd(slug, appUrl())).replace(/</g, "\\u003c") }} />;
}
