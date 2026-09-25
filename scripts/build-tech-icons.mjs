// Generates public/tech-icons/*.svg and src/lib/site/tech-icons.ts for every Site DNA signature.
// Sources (both CC0): @iconify-json/logos (full-color marks, preferred) and simple-icons (single-color marks).
// Technologies with no open-licensed mark fall back to a category icon in the UI.
// Run: node scripts/build-tech-icons.mjs   (after changing signatures.ts)
import fs from "node:fs";
import path from "node:path";
import * as simpleIcons from "simple-icons";

const logos = JSON.parse(fs.readFileSync("node_modules/@iconify-json/logos/icons.json", "utf8"));
const source = fs.readFileSync("src/lib/site/signatures.ts", "utf8");
const names = [...source.matchAll(/^\s*S\("([^"]+)"/gm)].map((match) => match[1]);
// Runtime-only names (deep scan globals) that are not signatures.
names.push("model-viewer");

const bySlug = new Map();
const byTitle = new Map();
for (const icon of Object.values(simpleIcons)) {
  if (!icon || typeof icon !== "object" || !icon.path) continue;
  bySlug.set(icon.slug, icon);
  byTitle.set(icon.title.toLowerCase(), icon);
}

// Explicit choices where the name doesn't map to a slug, or a sub-feature should use its parent's mark.
const OVERRIDES = {
  "Next.js": ["logos:nextjs-icon"], "Next.js App Router": ["logos:nextjs-icon"], "Next.js Image Optimization": ["logos:nextjs-icon"],
  "Nuxt": ["logos:nuxt-icon"], "React": ["logos:react"], "Preact": ["logos:preact"], "Vue.js": ["logos:vue"], "Angular": ["logos:angular-icon"], "AngularJS": ["logos:angular-icon"],
  "Svelte": ["logos:svelte-icon"], "SvelteKit": ["logos:svelte-icon"], "Astro": ["logos:astro-icon"], "Remix": ["logos:remix-icon"], "React Router": ["logos:react-router"],
  "Gatsby": ["logos:gatsby"], "Qwik": ["logos:qwik-icon"], "SolidJS": ["logos:solidjs-icon"], "Ember.js": ["logos:ember-tomster", "si:emberdotjs"], "Alpine.js": ["logos:alpinejs-icon"],
  "htmx": ["logos:htmx-icon"], "Hotwire Turbo": ["si:hotwire"], "Stimulus": ["logos:stimulus-icon", "si:stimulus"], "jQuery": ["logos:jquery"], "Lit": ["logos:lit-icon"],
  "Livewire": ["si:livewire"], "Inertia.js": ["si:inertia"], "Phoenix LiveView": ["logos:phoenix"], "Eleventy": ["logos:eleventy", "si:eleventy"], "Hugo": ["logos:hugo"],
  "Jekyll": ["logos:jekyll"], "Docusaurus": ["logos:docusaurus"], "VitePress": ["logos:vitejs", "logos:vite"], "Turbopack": ["logos:turbopack-icon"], "Vite": ["logos:vitejs", "logos:vite"],
  "Rolldown": ["logos:rolldown-icon"], "webpack": ["logos:webpack"], "Parcel": ["logos:parcel-icon"], "TypeScript": ["logos:typescript-icon"], "WebAssembly": ["logos:webassembly"],
  "Node.js": ["logos:nodejs-icon"], "WordPress": ["logos:wordpress-icon"], "WooCommerce": ["logos:woocommerce-icon"], "Elementor": ["si:elementor"], "Divi": ["si:divi"],
  "WPBakery": ["si:wordpress"], "Yoast SEO": ["si:yoast"], "Webflow": ["logos:webflow"], "Webflow Interactions": ["logos:webflow"], "Framer": ["logos:framer"],
  "Wix": ["si:wix"], "Squarespace": ["si:squarespace"], "Shopify": ["logos:shopify"], "Magento": ["logos:magento"], "BigCommerce": ["si:bigcommerce"],
  "PrestaShop": ["si:prestashop"], "Ghost": ["logos:ghost"], "Drupal": ["logos:drupal-icon"], "Joomla": ["logos:joomla"], "Craft CMS": ["si:craftcms"],
  "HubSpot CMS": ["logos:hubspot"], "Tilda": ["si:tilda"], "Readymag": ["si:readymag"], "Cargo": ["si:cargo"], "Carrd": ["si:carrd"], "Duda": ["si:duda"], "Bubble": ["si:bubble"],
  "Super": ["si:notion"], "Sanity": ["logos:sanity"], "Contentful": ["logos:contentful"], "Storyblok": ["logos:storyblok-icon"], "Prismic": ["logos:prismic-icon"], "DatoCMS": ["si:datocms"],
  "Hygraph": ["si:hygraph"], "Builder.io": ["si:builderdotio"], "Strapi": ["logos:strapi-icon"], "Payload": ["si:payloadcms"],
  "Tailwind CSS": ["logos:tailwindcss-icon"], "Bootstrap": ["logos:bootstrap"], "Bulma": ["logos:bulma"], "Foundation": ["logos:foundation"], "UIkit": ["si:uikit"], "UnoCSS": ["logos:unocss"],
  "Material UI": ["logos:material-ui"], "Chakra UI": ["logos:chakraui"], "Mantine": ["logos:mantine-icon"], "Ant Design": ["logos:ant-design"], "Radix UI": ["si:radixui"],
  "shadcn/ui": ["si:shadcnui"], "Headless UI": ["logos:headlessui-icon"], "styled-components": ["si:styledcomponents"], "Emotion": ["si:emotion"], "CSS Modules": ["si:cssmodules"],
  "Sass": ["logos:sass"], "Font Awesome": ["logos:font-awesome"], "Material Symbols": ["logos:google-icon", "si:google"], "Lucide": ["si:lucide"], "Swiper": ["logos:swiper"],
  "Splide": ["si:splide"], "Slick": ["si:jquery"], "Embla Carousel": ["si:embla"], "Flickity": ["si:flickity"],
  "GSAP": ["si:gsap"], "GSAP ScrollTrigger": ["si:gsap"], "GSAP ScrollSmoother": ["si:gsap"], "GSAP SplitText": ["si:gsap"], "GSAP Flip": ["si:gsap"], "GSAP MorphSVG": ["si:gsap"],
  "GSAP DrawSVG": ["si:gsap"], "GSAP Draggable": ["si:gsap"], "GSAP CustomEase": ["si:gsap"], "Framer Motion": ["logos:framer", "si:framer"], "anime.js": ["si:animedotjs"],
  "React Spring": ["logos:react-spring"], "Theatre.js": ["si:theatredotjs"], "AOS": ["si:aos"], "ScrollReveal": ["si:scrollreveal"], "Animate.css": ["si:animatedotcss"], "Splitting.js": ["si:splitting"],
  "Lenis": ["si:lenis"], "Locomotive Scroll": ["si:locomotive"], "Barba.js": ["si:barbadotjs"], "Swup": ["si:swup"], "Taxi.js": ["si:taxi"], "View Transitions API": ["logos:chrome", "si:googlechrome"],
  "three.js": ["logos:threejs", "si:threedotjs"], "React Three Fiber": ["logos:threejs", "si:threedotjs"], "OGL": ["si:webgl"], "PixiJS": ["logos:pixijs", "si:pixijs"], "Babylon.js": ["logos:babylonjs-icon", "si:babylondotjs"],
  "PlayCanvas": ["logos:playcanvas", "si:playcanvas"], "Spline": ["si:spline"], "curtains.js": ["si:webgl"], "Unicorn Studio": ["si:unicorn"], "WebGPU": ["logos:webgpu"],
  "Matter.js": ["si:matterdotjs"], "p5.js": ["logos:p5js"], "Rive": ["si:rive"], "Lottie": ["si:lottiefiles"], "model-viewer": ["si:googlechrome"],
  "Vercel": ["logos:vercel-icon"], "Netlify": ["logos:netlify-icon"], "Cloudflare": ["logos:cloudflare-icon"], "Cloudflare Pages": ["logos:cloudflare-icon"], "Cloudflare Web Analytics": ["logos:cloudflare-icon"],
  "Cloudflare Turnstile": ["logos:cloudflare-icon"], "Amazon CloudFront": ["logos:aws-cloudfront"], "Amazon S3": ["logos:aws-s3"], "AWS Elastic Load Balancing": ["logos:aws-elb", "logos:aws"],
  "AWS Amplify": ["logos:aws-amplify"], "Fastly": ["logos:fastly"], "Akamai": ["logos:akamai"], "Bunny CDN": ["si:bunnydotnet"], "Google Cloud": ["logos:google-cloud"],
  "Firebase Hosting": ["logos:firebase-icon", "logos:firebase"], "Firebase": ["logos:firebase-icon", "logos:firebase"], "GitHub Pages": ["logos:github-icon"], "Render": ["si:render"], "Fly.io": ["logos:fly-icon", "si:flydotio"],
  "Heroku": ["logos:heroku-icon"], "Microsoft Azure": ["logos:microsoft-azure"], "WP Engine": ["si:wpengine"], "Kinsta": ["si:kinsta"], "Pantheon": ["si:pantheon"], "Hostinger": ["si:hostinger"],
  "Railway": ["si:railway"], "Sucuri": ["si:sucuri"], "Imperva": ["si:imperva"], "nginx": ["logos:nginx"], "OpenResty": ["si:openresty"], "Apache HTTP Server": ["logos:apache"],
  "LiteSpeed": ["si:litespeed"], "Caddy": ["si:caddy"], "Microsoft IIS": ["logos:microsoft-icon"], "Envoy": ["si:envoyproxy"], "PHP": ["logos:php"], "MySQL": ["logos:mysql-icon"],
  "Laravel": ["logos:laravel"], "Symfony": ["si:symfony"], "Django": ["logos:django-icon"], "Flask": ["logos:flask"], "Python": ["logos:python"], "Ruby on Rails": ["logos:rails"],
  "Ruby": ["logos:ruby"], "Express": ["logos:express"], "ASP.NET": ["logos:dotnet"], "Java": ["logos:java"], "Elixir": ["logos:elixir"], "CodeIgniter": ["logos:codeigniter-icon"],
  "Google Tag Manager": ["logos:google-tag-manager"], "Google Analytics": ["logos:google-analytics"], "Meta Pixel": ["logos:meta-icon"], "Segment": ["logos:segment-icon"],
  "Vercel Analytics": ["logos:vercel-icon"], "Vercel Speed Insights": ["logos:vercel-icon"], "Plausible": ["logos:plausible-analytics", "si:plausibleanalytics"], "Fathom": ["si:fathom"],
  "Umami": ["si:umami"], "PostHog": ["logos:posthog-icon", "logos:posthog"], "Mixpanel": ["logos:mixpanel"], "Amplitude": ["logos:amplitude-icon"], "Hotjar": ["logos:hotjar-icon", "logos:hotjar"],
  "Microsoft Clarity": ["logos:microsoft-icon"], "LinkedIn Insight Tag": ["logos:linkedin-icon"], "TikTok Pixel": ["logos:tiktok-icon"], "Sentry": ["logos:sentry-icon"],
  "Datadog RUM": ["logos:datadog-icon", "logos:datadog"], "LogRocket": ["logos:logrocket"], "OneTrust": ["si:onetrust"], "Cookiebot": ["si:cookiebot"], "Usercentrics": ["si:usercentrics"],
  "CookieYes": ["si:cookieyes"], "Intercom": ["logos:intercom-icon"], "Crisp": ["si:crisp"], "Zendesk": ["logos:zendesk-icon"], "HubSpot": ["logos:hubspot"], "Calendly": ["si:calendly"],
  "Google reCAPTCHA": ["logos:recaptcha", "si:google"], "hCaptcha": ["si:hcaptcha"], "Clerk": ["logos:clerk-icon", "si:clerk"], "Auth0": ["logos:auth0-icon"], "Supabase": ["logos:supabase-icon"],
  "Stripe": ["logos:stripe"], "PayPal": ["logos:paypal"], "Razorpay": ["si:razorpay"], "Algolia": ["logos:algolia"], "Cloudinary": ["logos:cloudinary-icon", "logos:cloudinary"],
  "imgix": ["si:imgix"], "Mux": ["si:mux"], "Vimeo": ["logos:vimeo-icon"], "YouTube": ["logos:youtube-icon"], "Google Fonts": ["logos:google-icon", "si:googlefonts"],
  "Adobe Fonts": ["si:adobefonts", "logos:adobe"], "Fontshare": ["si:indiantypefoundry"], "Bunny Fonts": ["si:bunnydotnet"], "Monotype Fonts": ["si:monotype"],
};

const slugify = (name) => name.toLowerCase().replace(/\+/g, "plus").replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fileFor = (name) => `${slugify(name) || "icon"}.svg`;

function fromLogos(slug) {
  const key = logos.aliases?.[slug]?.parent ?? slug;
  const icon = logos.icons[key];
  if (!icon) return null;
  const width = icon.width ?? logos.width ?? 256;
  const height = icon.height ?? logos.height ?? 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}">${icon.body}</svg>`;
}

function fromSimple(slug) {
  const icon = bySlug.get(slug) ?? byTitle.get(slug);
  if (!icon) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${icon.hex}" d="${icon.path}"/></svg>`;
}

/** Width / height of an SVG's viewBox. Wordmarks (wide logos with text) are unreadable in a square tile. */
const ratio = (svg) => {
  const [, , width, height] = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg).slice(1).map(Number);
  return width / height;
};

/** The first square mark among the candidates (overrides first, then logos, then simple-icons); a wordmark only as a last resort. */
function resolve(name) {
  const base = slugify(name);
  const siSlug = name.toLowerCase().replace(/\./g, "dot").replace(/[^a-z0-9]/g, "");
  const overrides = OVERRIDES[name] ?? [];
  const candidates = [
    ...overrides,
    `logos:${base}-icon`, `logos:${base}`, `logos:${base.replace(/-/g, "")}`,
    ...overrides.filter((item) => item.startsWith("logos:")).map((item) => `${item}-icon`),
    `si:${siSlug}`, `si:${name.toLowerCase()}`,
    ...overrides.map((item) => `si:${item.split(":")[1].replace(/-icon$/, "").replace(/-/g, "")}`),
  ];
  let wide = null;
  for (const candidate of candidates) {
    const [set, slug] = candidate.split(":");
    const svg = set === "logos" ? fromLogos(slug) : fromSimple(slug);
    if (!svg) continue;
    const shape = ratio(svg);
    if (shape <= 1.6 && shape >= 0.62) return { svg, from: candidate };
    wide ??= { svg, from: candidate };
  }
  return wide;
}

const outDir = "public/tech-icons";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = {};
const missing = [];
for (const name of [...new Set(names)]) {
  const found = resolve(name);
  if (!found) { missing.push(name); continue; }
  const file = fileFor(name);
  fs.writeFileSync(path.join(outDir, file), found.svg);
  manifest[name] = file;
}
fs.writeFileSync("src/lib/site/tech-icons.ts", `// Generated by scripts/build-tech-icons.mjs from @iconify-json/logos and simple-icons (both CC0).
// Trademarks belong to their owners; marks are shown only to identify each technology. Do not edit by hand.
// Technologies missing here get a category icon in the UI.

/** Technology name → file in /public/tech-icons. */
export const TECH_ICONS: Record<string, string> = ${JSON.stringify(manifest, null, 2)};
`);
console.log(`${Object.keys(manifest).length} icons written, ${missing.length} without an open-licensed mark:`);
console.log(missing.join(", "));
