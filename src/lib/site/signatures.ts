import type { TechCategory } from "./types";

/**
 * Detection rules. Each pattern is tested against one kind of public input; a capture group 1 (when present) is read
 * as the version. Patterns target strings that survive minification: property names, class names, banners, globals,
 * URL paths and header values.
 */
export interface Signature {
  name: string;
  category: TechCategory;
  description: string;
  website?: string;
  color?: string;
  /** The page HTML (including inline scripts and styles). */
  html?: RegExp[];
  /** URLs of scripts, stylesheets, preloads and links. */
  url?: RegExp[];
  /** Contents of JavaScript files. */
  js?: RegExp[];
  /** Contents of stylesheets and inline styles. */
  css?: RegExp[];
  /** [header name, value pattern]. */
  headers?: [string, RegExp][];
  /** Cookie names set by the page response. */
  cookies?: RegExp[];
  /** <meta name="…" content="…"> pairs, name in lower case. */
  meta?: [string, RegExp][];
  /** Extra version patterns, tried on the texts where the technology was found. */
  version?: RegExp[];
  implies?: string[];
  /** Defaults to "high" for html/url/js/css/header markers. */
  confidence?: "high" | "medium" | "low";
}

const S = (name: string, category: TechCategory, description: string, rest: Omit<Signature, "name" | "category" | "description"> = {}): Signature => ({ name, category, description, ...rest });

export const SIGNATURES: Signature[] = [
  // ── Frameworks and meta-frameworks ────────────────────────────────────────────────────────────────────────────
  S("Next.js", "Meta-framework", "React framework by Vercel with server rendering, routing and bundling.", {
    website: "https://nextjs.org", color: "#000000",
    html: [/\/_next\/static\//, /__NEXT_DATA__/, /self\.__next_f/],
    headers: [["x-powered-by", /Next\.js/], ["x-nextjs-cache", /./], ["x-nextjs-prerender", /./], ["x-nextjs-stale-time", /./]],
    js: [/version:["'`](\d+\.\d+\.\d+[\w.-]*)["'`],appDir/, /__NEXT_P\b|__next_app__|next-route-announcer/],
    version: [/version:["'`](\d+\.\d+\.\d+[\w.-]*)["'`],appDir/, /window\.next=\{version:["'`](\d+\.\d+\.\d+[\w.-]*)["'`]/],
    implies: ["React", "Node.js"],
  }),
  S("Next.js App Router", "Meta-framework", "Next.js's React Server Components router (app/ directory).", { website: "https://nextjs.org/docs/app", color: "#000000", html: [/self\.__next_f\.push/], implies: ["Next.js"] }),
  S("Nuxt", "Meta-framework", "Vue framework with server rendering and file-based routing.", {
    website: "https://nuxt.com", color: "#00DC82",
    html: [/window\.__NUXT__|__NUXT_DATA__|id="__nuxt"|\/_nuxt\//], headers: [["x-powered-by", /Nuxt/]], implies: ["Vue.js", "Node.js"],
  }),
  S("React", "Framework", "Component-based UI library from Meta.", {
    website: "https://react.dev", color: "#61DAFB",
    js: [/Symbol\.for\("react\.(?:transitional\.)?element"\)/, /reconcilerVersion:["'`](\d+\.\d+\.\d+[\w.-]*)["'`]/, /__REACT_DEVTOOLS_GLOBAL_HOOK__/],
    html: [/data-reactroot|_reactListening/],
    version: [/reconcilerVersion:["'`](\d+\.\d+\.\d+[\w.-]*)["'`]/, /version:["'`](1[5-9]\.\d+\.\d+[\w.-]*)["'`],rendererPackageName/],
  }),
  S("Preact", "Framework", "3 KB React alternative with the same API.", { website: "https://preactjs.com", color: "#673AB8", js: [/__PREACT_DEVTOOLS__|preact\/(?:hooks|compat)/], url: [/preact(?:@[\d.]+)?\//] }),
  S("Vue.js", "Framework", "Progressive JavaScript framework for building UIs.", {
    website: "https://vuejs.org", color: "#4FC08D",
    js: [/__VUE__|__vue_app__|__VUE_OPTIONS_API__|__VUE_PROD_DEVTOOLS__/], html: [/data-v-[0-9a-f]{8}\b|data-server-rendered="true"/],
    url: [/\/vue(?:@|\.)(\d[\d.]*)?/],
  }),
  S("Angular", "Framework", "Google's TypeScript application framework.", { website: "https://angular.dev", color: "#DD0031", html: [/ng-version="([\d.]+)"/, /_nghost-[a-z]{3}-c\d+/], implies: ["TypeScript"] }),
  S("AngularJS", "Framework", "The original Angular 1.x framework.", { website: "https://angularjs.org", color: "#E23237", html: [/\bng-app\b|\bng-controller=/], js: [/AngularJS v(1\.[\d.]+)/] }),
  S("Svelte", "Framework", "Compiler-based UI framework.", { website: "https://svelte.dev", color: "#FF3E00", html: [/class="[^"]*\bsvelte-[a-z0-9]{4,8}\b/], js: [/__svelte|svelte\/internal|\$\$props/] }),
  S("SvelteKit", "Meta-framework", "Application framework for Svelte.", { website: "https://svelte.dev/docs/kit", color: "#FF3E00", html: [/__sveltekit_|\/_app\/immutable\/|data-sveltekit-/], implies: ["Svelte", "Node.js"] }),
  S("Astro", "Meta-framework", "Content-first framework that ships zero JS by default (islands).", {
    website: "https://astro.build", color: "#BC52EE",
    html: [/<astro-island|data-astro-cid-|\/_astro\//], meta: [["generator", /Astro v?([\d.]+)/]],
  }),
  S("Remix", "Meta-framework", "Full-stack React framework focused on web standards.", { website: "https://remix.run", color: "#000000", html: [/__remixContext|__remixManifest/], implies: ["React"] }),
  S("React Router", "Meta-framework", "React Router in framework mode (formerly Remix).", { website: "https://reactrouter.com", color: "#CA4245", html: [/__reactRouterContext|__reactRouterManifest/], implies: ["React"] }),
  S("Gatsby", "Meta-framework", "React static-site generator with a GraphQL data layer.", { website: "https://www.gatsbyjs.com", color: "#663399", html: [/id="___gatsby"|\/page-data\/app-data\.json/], meta: [["generator", /Gatsby ([\d.]+)/]], implies: ["React"] }),
  S("Qwik", "Framework", "Resumable framework that loads JavaScript on interaction.", { website: "https://qwik.dev", color: "#AC7EF4", html: [/q:container=|qwikloader|q:base=/] }),
  S("SolidJS", "Framework", "Fine-grained reactive UI library.", { website: "https://www.solidjs.com", color: "#2C4F7C", html: [/_\$HY\b|data-hk="/] }),
  S("Ember.js", "Framework", "Opinionated framework for ambitious web apps.", { website: "https://emberjs.com", color: "#E04E39", html: [/class="[^"]*ember-application|id="ember\d+"/] }),
  S("Alpine.js", "JavaScript library", "Lightweight reactive behaviour in HTML attributes.", { website: "https://alpinejs.dev", color: "#8BC0D0", html: [/\bx-data(?:=|\s|>)/], js: [/Alpine\.start\(|alpine:init/], url: [/alpinejs(?:@([\d.]+))?/] }),
  S("htmx", "JavaScript library", "HTML-driven AJAX, swaps and server-rendered partials.", { website: "https://htmx.org", color: "#3366CC", html: [/\bhx-(?:get|post|swap|target|boost)=/], url: [/htmx(?:\.org)?(?:@([\d.]+))?/] }),
  S("Hotwire Turbo", "JavaScript library", "Rails' SPA-like navigation without writing JavaScript.", { website: "https://turbo.hotwired.dev", color: "#5CD8E5", html: [/data-turbo(?:-track)?=|<turbo-frame/], js: [/Turbo\.session|turbo:load/] }),
  S("Stimulus", "JavaScript library", "Modest JavaScript framework for server-rendered HTML.", { website: "https://stimulus.hotwired.dev", color: "#77E8B9", js: [/@hotwired\/stimulus|Stimulus\.register\(/], confidence: "medium" }),
  S("jQuery", "JavaScript library", "Classic DOM and AJAX utility library.", {
    website: "https://jquery.com", color: "#0769AD",
    url: [/jquery[.-]?(\d+\.\d+\.\d+)?(?:\.min)?\.js/i], js: [/jQuery v(\d+\.\d+\.\d+)|jquery:"(\d+\.\d+\.\d+)"/, /jQuery JavaScript Library v(\d+\.\d+\.\d+)/],
  }),
  S("Lit", "Framework", "Google's library for fast web components.", { website: "https://lit.dev", color: "#324FFF", js: [/litElementVersions|litHtmlVersions/], version: [/litElementVersions[^)]*\)\.push\("([\d.]+)"/] }),
  S("Livewire", "JavaScript library", "Laravel's full-stack reactive components.", { website: "https://livewire.laravel.com", color: "#FB70A9", html: [/wire:(?:id|snapshot|model|click)=|livewire\.js/], implies: ["Laravel"] }),
  S("Inertia.js", "JavaScript library", "Server-driven single-page apps for Laravel and Rails.", { website: "https://inertiajs.com", color: "#9553E9", html: [/<div id="app" data-page="/] }),
  S("Phoenix LiveView", "Framework", "Elixir server-rendered real-time UI.", { website: "https://www.phoenixframework.org", color: "#FD4F00", html: [/data-phx-(?:main|session|static)/], implies: ["Elixir"] }),
  S("Eleventy", "Meta-framework", "Simple static-site generator.", { website: "https://www.11ty.dev", color: "#222222", meta: [["generator", /Eleventy v?([\d.]+)/]] }),
  S("Hugo", "Meta-framework", "Go static-site generator.", { website: "https://gohugo.io", color: "#FF4088", meta: [["generator", /Hugo ([\d.]+)/]] }),
  S("Jekyll", "Meta-framework", "Ruby static-site generator (GitHub Pages).", { website: "https://jekyllrb.com", color: "#CC0000", meta: [["generator", /Jekyll v?([\d.]+)/]], html: [/<!-- Begin Jekyll SEO tag/] }),
  S("Docusaurus", "Meta-framework", "Meta's documentation site generator.", { website: "https://docusaurus.io", color: "#3ECC5F", meta: [["generator", /Docusaurus v?([\d.]+)/]], implies: ["React"] }),
  S("VitePress", "Meta-framework", "Vue-powered static docs generator.", { website: "https://vitepress.dev", color: "#5C73E7", html: [/__VP_HASH_MAP__|__VP_SITE_DATA__/], meta: [["generator", /VitePress v?([\d.]+)/]], implies: ["Vue.js"] }),

  // ── Build tools and languages ─────────────────────────────────────────────────────────────────────────────────
  S("Turbopack", "Build tool", "Rust-based incremental bundler built into Next.js.", { website: "https://nextjs.org/docs/app/api-reference/turbopack", color: "#EF4444", url: [/\/chunks\/turbopack-/], js: [/TURBOPACK|__turbopack_/] }),
  S("Vite", "Build tool", "Fast dev server and Rollup/Rolldown-based production bundler.", {
    website: "https://vite.dev", color: "#646CFF",
    js: [/__vite__mapDeps|__vitePreload|vite\/modulepreload-polyfill|__VITE_PRELOAD__/], url: [/\/assets\/(?:index|main|app)-[\w-]{8}\.js$/],
  }),
  S("Rolldown", "Build tool", "Rust bundler that powers Vite 7+.", { website: "https://rolldown.rs", color: "#FF7E17", url: [/rolldown-runtime/], implies: ["Vite"] }),
  S("webpack", "Build tool", "Module bundler.", { website: "https://webpack.js.org", color: "#8DD6F9", js: [/webpackChunk[\w$]*|__webpack_require__/] }),
  S("Parcel", "Build tool", "Zero-configuration bundler.", { website: "https://parceljs.org", color: "#E7A93B", js: [/parcelRequire[\w]*/] }),
  S("TypeScript", "Language", "Typed superset of JavaScript.", { website: "https://www.typescriptlang.org", color: "#3178C6", js: [/__awaiter\(|__decorate\(|__extends\(/], confidence: "low" }),
  S("WebAssembly", "Language", "Compiled binary code running in the browser (C, C++, Rust, Go …).", { website: "https://webassembly.org", color: "#654FF0", js: [/WebAssembly\.instantiate(?:Streaming)?\(/], url: [/\.wasm(?:\?|$)/] }),
  S("Node.js", "Language", "JavaScript runtime on the server.", { website: "https://nodejs.org", color: "#5FA04E", headers: [["x-powered-by", /Express|Next\.js|Nuxt/]], confidence: "medium" }),

  // ── CMS, builders, e-commerce ────────────────────────────────────────────────────────────────────────────────
  S("WordPress", "CMS", "The most used CMS on the web (PHP).", {
    website: "https://wordpress.org", color: "#21759B",
    html: [/\/wp-content\/|\/wp-includes\//], meta: [["generator", /WordPress ?([\d.]+)?/]], headers: [["link", /wp-json|wp\.me/], ["x-pingback", /xmlrpc\.php/]],
    version: [/ver=(\d+\.\d+(?:\.\d+)?)["'&][^>]*wp-includes|wp-includes[^"']*\?ver=(\d+\.\d+(?:\.\d+)?)/], implies: ["PHP", "MySQL"],
  }),
  S("WooCommerce", "E-commerce", "WordPress e-commerce plugin.", { website: "https://woocommerce.com", color: "#96588A", html: [/woocommerce(?:-|_)|wc-block/], implies: ["WordPress"] }),
  S("Elementor", "Site builder", "Visual page builder for WordPress.", { website: "https://elementor.com", color: "#92003B", html: [/elementor-(?:section|element|widget|kit)|\/plugins\/elementor\//], meta: [["generator", /Elementor ([\d.]+)/]], implies: ["WordPress"] }),
  S("Divi", "Site builder", "Elegant Themes' WordPress builder.", { website: "https://www.elegantthemes.com/gallery/divi/", color: "#8F42EC", html: [/\bet_pb_|\/themes\/Divi\//], implies: ["WordPress"] }),
  S("WPBakery", "Site builder", "WordPress page builder (Visual Composer).", { website: "https://wpbakery.com", color: "#0473AA", html: [/\bvc_row\b|js_composer/], implies: ["WordPress"] }),
  S("Yoast SEO", "CMS", "WordPress SEO plugin.", { website: "https://yoast.com", color: "#A4286A", html: [/yoast-schema-graph|This site is optimized with the Yoast SEO/] , implies: ["WordPress"] }),
  S("Webflow", "Site builder", "Visual site builder with hosting and CMS.", {
    website: "https://webflow.com", color: "#146EF5",
    html: [/data-wf-(?:page|site)=/], meta: [["generator", /Webflow/]], url: [/(?:assets|uploads)-global\.website-files\.com|cdn\.prod\.website-files\.com/],
  }),
  S("Webflow Interactions", "Animation", "Webflow's built-in timeline animations (IX2).", { website: "https://webflow.com/interactions-animations", color: "#146EF5", html: [/data-w-id="/], js: [/Webflow\.require\("ix2"\)/], implies: ["Webflow"] }),
  S("Framer", "Site builder", "Design-to-site builder with built-in motion.", {
    website: "https://www.framer.com", color: "#0055FF",
    html: [/data-framer-(?:name|component-type|hydrate-v2)|framerusercontent\.com/], meta: [["generator", /Framer ?([\w.]+)?/]], implies: ["React", "Framer Motion"],
  }),
  S("Wix", "Site builder", "Hosted drag-and-drop website builder.", { website: "https://www.wix.com", color: "#0C6EFC", html: [/static\.wixstatic\.com|static\.parastorage\.com/], headers: [["x-wix-request-id", /./]], meta: [["generator", /Wix\.com/]] }),
  S("Squarespace", "Site builder", "Hosted website builder with templates.", { website: "https://www.squarespace.com", color: "#000000", html: [/static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/], headers: [["server", /Squarespace/]] }),
  S("Shopify", "E-commerce", "Hosted e-commerce platform.", {
    website: "https://www.shopify.com", color: "#7AB55C",
    html: [/cdn\.shopify\.com\/s\/files|Shopify\.theme|shopify-section|Shopify\.shop\s*=/], headers: [["x-shopify-stage", /./], ["powered-by", /Shopify/]],
  }),
  S("Magento", "E-commerce", "Adobe Commerce / Magento open-source store.", { website: "https://business.adobe.com/products/magento/magento-commerce.html", color: "#EE672F", html: [/Magento_|mage\/cookies|text\/x-magento-init/], implies: ["PHP"] }),
  S("BigCommerce", "E-commerce", "Hosted e-commerce platform.", { website: "https://www.bigcommerce.com", color: "#121118", html: [/cdn\d*\.bigcommerce\.com/] }),
  S("PrestaShop", "E-commerce", "Open-source PHP e-commerce.", { website: "https://prestashop.com", color: "#DF0067", html: [/\bprestashop\b|\/modules\/ps_\w+\//], meta: [["generator", /PrestaShop/]], implies: ["PHP"] }),
  S("Ghost", "CMS", "Node.js publishing platform.", { website: "https://ghost.org", color: "#15171A", meta: [["generator", /Ghost ([\d.]+)/]], implies: ["Node.js"] }),
  S("Drupal", "CMS", "Enterprise open-source CMS (PHP).", { website: "https://www.drupal.org", color: "#0678BE", meta: [["generator", /Drupal ?(\d+)?/]], html: [/drupal-settings-json|\/sites\/default\/files\//], headers: [["x-drupal-cache", /./], ["x-generator", /Drupal ?(\d+)?/]], implies: ["PHP"] }),
  S("Joomla", "CMS", "Open-source PHP CMS.", { website: "https://www.joomla.org", color: "#5091CD", meta: [["generator", /Joomla!?/]], implies: ["PHP"] }),
  S("Craft CMS", "CMS", "Flexible PHP CMS popular with studios.", { website: "https://craftcms.com", color: "#E5422B", headers: [["x-powered-by", /Craft CMS/]], cookies: [/^CRAFT_CSRF_TOKEN$/], implies: ["PHP"] }),
  S("HubSpot CMS", "CMS", "HubSpot's content hub.", { website: "https://www.hubspot.com/products/cms", color: "#FF7A59", html: [/hs-sites\.com|hubspotusercontent|hs-scripts\.com\/\d+/], meta: [["generator", /HubSpot/]] }),
  S("Tilda", "Site builder", "Block-based website builder.", { website: "https://tilda.cc", color: "#000000", html: [/tildacdn\.com|data-tilda-/] }),
  S("Readymag", "Site builder", "Design tool for editorial and portfolio sites.", { website: "https://readymag.com", color: "#FF5A5F", html: [/readymag\.com|rmcdn\d?\.net/] }),
  S("Cargo", "Site builder", "Site builder for artists and designers.", { website: "https://cargo.site", color: "#000000", html: [/cargo\.site|cargocollective/] }),
  S("Carrd", "Site builder", "Simple one-page sites.", { website: "https://carrd.co", color: "#596CAF", meta: [["generator", /Carrd/]] }),
  S("Duda", "Site builder", "Website builder for agencies.", { website: "https://www.duda.co", color: "#FF6D00", html: [/irp\.cdn-website\.com|dudaone/] }),
  S("Bubble", "Site builder", "No-code web app builder.", { website: "https://bubble.io", color: "#0000FF", html: [/bubble\.io|_bubble_page_load_data/] }),
  S("Super", "Site builder", "Websites built from Notion pages.", { website: "https://super.so", color: "#000000", html: [/super-static-assets|super\.so/] }),
  S("Sanity", "Headless CMS", "Structured content platform with a real-time API.", { website: "https://www.sanity.io", color: "#F03E2F", html: [/cdn\.sanity\.io/], js: [/cdn\.sanity\.io|\.api\.sanity\.io/] }),
  S("Contentful", "Headless CMS", "API-first content platform.", { website: "https://www.contentful.com", color: "#0681B6", html: [/(?:images|videos|assets)\.ctfassets\.net/], js: [/cdn\.contentful\.com|ctfassets\.net/] }),
  S("Storyblok", "Headless CMS", "Headless CMS with a visual editor.", { website: "https://www.storyblok.com", color: "#09B3AF", html: [/a(?:-us)?\.storyblok\.com/], js: [/api(?:-us)?\.storyblok\.com/] }),
  S("Prismic", "Headless CMS", "Headless page builder.", { website: "https://prismic.io", color: "#5163BA", html: [/images\.prismic\.io|\.cdn\.prismic\.io/], js: [/\.cdn\.prismic\.io\/api/] }),
  S("DatoCMS", "Headless CMS", "Headless CMS with an image CDN.", { website: "https://www.datocms.com", color: "#FF7751", html: [/datocms-assets\.com/], js: [/graphql\.datocms\.com/] }),
  S("Hygraph", "Headless CMS", "GraphQL-native headless CMS (formerly GraphCMS).", { website: "https://hygraph.com", color: "#090E24", html: [/media\.graphassets\.com|graphcms/], js: [/hygraph\.com|graphcms\.com/] }),
  S("Builder.io", "Headless CMS", "Visual headless CMS.", { website: "https://www.builder.io", color: "#1C6BD2", html: [/cdn\.builder\.io/] }),
  S("Strapi", "Headless CMS", "Open-source Node.js headless CMS.", { website: "https://strapi.io", color: "#4945FF", html: [/strapiapp\.com/], js: [/strapiapp\.com/] }),
  S("Payload", "Headless CMS", "TypeScript headless CMS for Next.js.", { website: "https://payloadcms.com", color: "#000000", js: [/payloadcms|payload-/], confidence: "low" }),

  // ── UI frameworks, CSS, components ───────────────────────────────────────────────────────────────────────────
  S("Tailwind CSS", "UI framework", "Utility-first CSS framework.", {
    website: "https://tailwindcss.com", color: "#06B6D4",
    css: [/tailwindcss v(\d+\.\d+\.\d+)/, /--tw-(?:ring-offset-shadow|shadow-colored|translate-x|rotate|border-spacing-x|space-y-reverse)/],
    version: [/tailwindcss v(\d+\.\d+\.\d+)/],
  }),
  S("Bootstrap", "UI framework", "The classic responsive CSS framework.", {
    website: "https://getbootstrap.com", color: "#7952B3",
    css: [/Bootstrap\s+v(\d+\.\d+\.\d+)/, /--bs-(?:body-bg|primary-rgb|gutter-x)/], url: [/bootstrap(?:@(\d[\d.]*))?(?:\/dist)?\/(?:css|js)\/bootstrap(?:\.bundle)?(?:\.min)?\.(?:css|js)/],
    version: [/Bootstrap\s+v(\d+\.\d+\.\d+)/],
  }),
  S("Bulma", "UI framework", "Flexbox CSS framework.", { website: "https://bulma.io", color: "#00D1B2", css: [/bulma\.io v(\d+\.\d+\.\d+)|--bulma-/] }),
  S("Foundation", "UI framework", "Zurb's responsive front-end framework.", { website: "https://get.foundation", color: "#1779BA", css: [/Foundation for Sites v?(\d+\.\d+\.\d+)?/] }),
  S("UIkit", "UI framework", "Modular front-end framework.", { website: "https://getuikit.com", color: "#2396F3", css: [/UIkit (\d+\.\d+\.\d+)/], html: [/class="[^"]*\buk-(?:container|grid|navbar)/] }),
  S("UnoCSS", "UI framework", "Instant on-demand atomic CSS engine.", { website: "https://unocss.dev", color: "#333333", css: [/--un-(?:rotate|translate-x|ring-offset-shadow|shadow)/] }),
  S("Material UI", "Component library", "Google Material Design components for React (MUI).", { website: "https://mui.com", color: "#007FFF", html: [/class="[^"]*\bMui[A-Z]\w+-root/], js: [/MuiButtonBase|MuiTypography/], implies: ["Emotion"] }),
  S("Chakra UI", "Component library", "Accessible React component library.", { website: "https://chakra-ui.com", color: "#319795", css: [/--chakra-colors-/], html: [/class="[^"]*\bchakra-/] }),
  S("Mantine", "Component library", "Full-featured React components.", { website: "https://mantine.dev", color: "#339AF0", css: [/--mantine-(?:color|spacing|radius)/], html: [/class="[^"]*\bmantine-/] }),
  S("Ant Design", "Component library", "Enterprise React UI library.", { website: "https://ant.design", color: "#1677FF", html: [/class="[^"]*\bant-(?:btn|layout|menu|row|col)\b/], css: [/\.ant-btn\b/] }),
  S("Radix UI", "Component library", "Unstyled, accessible React primitives.", { website: "https://www.radix-ui.com", color: "#161618", html: [/data-radix-|radix-:[\w]+:/], js: [/data-radix-(?:collection-item|popper-content-wrapper|scroll-area-viewport)/] }),
  S("shadcn/ui", "Component library", "Copy-paste components built on Radix and Tailwind.", {
    website: "https://ui.shadcn.com", color: "#000000",
    css: [/--muted-foreground:[^;]+;[\s\S]{0,600}?--popover-foreground:|--popover-foreground:[^;]+;[\s\S]{0,600}?--muted-foreground:/], confidence: "medium",
  }),
  S("Headless UI", "Component library", "Unstyled components from the Tailwind team.", { website: "https://headlessui.com", color: "#66E3FF", html: [/data-headlessui-state|id="headlessui-/] }),
  S("styled-components", "CSS", "CSS-in-JS with tagged template literals.", { website: "https://styled-components.com", color: "#DB7093", html: [/data-styled(?:-version)?=|\bsc-[a-zA-Z]{5,7}\b/], version: [/data-styled-version="([\d.]+)"/] }),
  S("Emotion", "CSS", "CSS-in-JS library.", { website: "https://emotion.sh", color: "#D36AC2", html: [/data-emotion="css/] }),
  S("CSS Modules", "CSS", "Locally scoped class names generated at build time.", { website: "https://github.com/css-modules/css-modules", color: "#000000", html: [/class="[^"]*\b[A-Za-z][\w]*_[A-Za-z][\w]*__[\w-]{5}\b/], confidence: "medium" }),
  S("Sass", "CSS", "CSS preprocessor.", { website: "https://sass-lang.com", color: "#CC6699", url: [/\.s[ac]ss(?:\?|$)/], css: [/sourceMappingURL=[^*]*\.scss/], confidence: "medium" }),
  S("Font Awesome", "Icons", "Icon font and SVG toolkit.", { website: "https://fontawesome.com", color: "#538DD7", url: [/font-?awesome|kit\.fontawesome\.com|use\.fontawesome\.com/], html: [/class="[^"]*\bfa-(?:solid|regular|brands|light)\b/] }),
  S("Material Symbols", "Icons", "Google's variable icon font.", { website: "https://fonts.google.com/icons", color: "#4285F4", url: [/fonts\.googleapis\.com\/css2?\?family=Material\+(?:Symbols|Icons)/] }),
  S("Lucide", "Icons", "Open-source icon set (Feather fork).", { website: "https://lucide.dev", color: "#F56565", html: [/class="[^"]*\blucide(?:-[a-z-]+)?\b/] }),
  S("Swiper", "Carousel", "Touch slider and carousel.", { website: "https://swiperjs.com", color: "#0080FF", html: [/class="[^"]*\bswiper(?:-wrapper|-slide)?\b/], css: [/Swiper (\d+\.\d+\.\d+)/], js: [/swiper-slide-active/] }),
  S("Splide", "Carousel", "Lightweight slider.", { website: "https://splidejs.com", color: "#000000", html: [/class="[^"]*\bsplide\b/] }),
  S("Slick", "Carousel", "jQuery carousel.", { website: "https://kenwheeler.github.io/slick/", color: "#000000", html: [/class="[^"]*\bslick-(?:slider|track)\b/], css: [/\.slick-track\b/] }),
  S("Embla Carousel", "Carousel", "Dependency-free carousel engine.", { website: "https://www.embla-carousel.com", color: "#E57B00", js: [/emblaApi|embla__|containScroll:"trimSnaps"/], html: [/class="[^"]*\bembla\b/] }),
  S("Flickity", "Carousel", "Touch, responsive, flickable carousels.", { website: "https://flickity.metafizzy.co", color: "#E6B800", html: [/class="[^"]*\bflickity-/] }),

  // ── Motion: animation, scrolling, transitions ────────────────────────────────────────────────────────────────
  S("GSAP", "Animation", "GreenSock Animation Platform, the industry standard for high-performance timeline animation.", {
    website: "https://gsap.com", color: "#0AE448",
    js: [/_gsap\b|GreenSock|gsap\.registerPlugin|_gsScope/], url: [/gsap(?:@(\d[\d.]*))?(?:\/dist)?\/gsap(?:\.min)?\.js|\/gsap(?:[-.][\w]{6,})?(?:\.min)?\.js/i],
    version: [/\.version=["'`](3\.\d+\.\d+)["'`]/, /\*\s*GSAP (3\.\d+\.\d+)/, /gsap@(\d+\.\d+\.\d+)/],
  }),
  S("GSAP ScrollTrigger", "Animation", "Scroll-linked animations, pinning and scrubbing.", { website: "https://gsap.com/docs/v3/Plugins/ScrollTrigger/", color: "#0AE448", js: [/ScrollTrigger|pin-spacer|scrollTrigger:\{/], url: [/ScrollTrigger(?:\.min)?\.js/i], implies: ["GSAP"] }),
  S("GSAP ScrollSmoother", "Smooth scroll", "GSAP's native-scroll smoothing with parallax effects.", { website: "https://gsap.com/docs/v3/Plugins/ScrollSmoother/", color: "#0AE448", js: [/ScrollSmoother\.create\(|["'`]#?smooth-content["'`]|smoothTouch:/], html: [/id="smooth-wrapper"/], implies: ["GSAP", "GSAP ScrollTrigger"] }),
  S("GSAP SplitText", "Animation", "Splits text into characters, words and lines to animate them.", { website: "https://gsap.com/docs/v3/Plugins/SplitText/", color: "#0AE448", js: [/SplitText|splitText/], url: [/SplitText(?:\.min)?\.js/i], implies: ["GSAP"] }),
  S("GSAP Flip", "Animation", "Animates layout changes (First-Last-Invert-Play).", { website: "https://gsap.com/docs/v3/Plugins/Flip/", color: "#0AE448", js: [/Flip\.(?:getState|from|fit)\(/], url: [/Flip(?:\.min)?\.js/], implies: ["GSAP"] }),
  S("GSAP MorphSVG", "Animation", "Morphs one SVG shape into another.", { website: "https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/", color: "#0AE448", js: [/MorphSVGPlugin|morphSVG:/], implies: ["GSAP"] }),
  S("GSAP DrawSVG", "Animation", "Animates SVG strokes as if drawn.", { website: "https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/", color: "#0AE448", js: [/DrawSVGPlugin|drawSVG:/], implies: ["GSAP"] }),
  S("GSAP Draggable", "Animation", "Drag, spin and throw anything with inertia.", { website: "https://gsap.com/docs/v3/Plugins/Draggable/", color: "#0AE448", js: [/Draggable\.create\(|InertiaPlugin/], implies: ["GSAP"] }),
  S("GSAP CustomEase", "Animation", "Custom easing curves drawn as SVG paths.", { website: "https://gsap.com/docs/v3/Eases/CustomEase/", color: "#0AE448", js: [/CustomEase\.create\(|CustomEase/], implies: ["GSAP"] }),
  S("Framer Motion", "Animation", "Declarative React animation library (now Motion).", {
    website: "https://motion.dev", color: "#FFF312",
    js: [/whileHover|whileInView|framerAppearId|data-projection-id|projectionNodeId/], version: [/this\.version=["'`](1[0-2]\.\d+\.\d+)["'`]/],
  }),
  S("anime.js", "Animation", "Lightweight JavaScript animation engine.", { website: "https://animejs.com", color: "#FF4B4B", js: [/anime\.js|animejs|anime\.timeline\(/], url: [/animejs|anime(?:\.min)?\.js/i] }),
  S("React Spring", "Animation", "Spring-physics animation for React.", { website: "https://www.react-spring.dev", color: "#FF6D6D", js: [/SpringValue\b|@react-spring\/(?:web|core|three)/] }),
  S("Theatre.js", "Animation", "Motion design editor and timeline for the web.", { website: "https://www.theatrejs.com", color: "#00A3FF", js: [/@theatre\/(?:core|studio)|theatrejs/] }),
  S("AOS", "Animation", "Animate On Scroll library.", { website: "https://michalsnik.github.io/aos/", color: "#1E90FF", html: [/\bdata-aos="/], url: [/\baos(?:@[\d.]+)?(?:\/dist)?\/aos(?:\.min)?\.(?:js|css)/] }),
  S("ScrollReveal", "Animation", "Reveals elements as they enter the viewport.", { website: "https://scrollrevealjs.org", color: "#FFCB36", js: [/ScrollReveal\(/], url: [/scrollreveal/i] }),
  S("Animate.css", "Animation", "Ready-made CSS animations.", { website: "https://animate.style", color: "#F9E900", css: [/animate__animated|Animate\.css/], url: [/animate(?:\.min)?\.css/] }),
  S("Splitting.js", "Animation", "Splits text into spans with CSS variables.", { website: "https://splitting.js.org", color: "#FF5E5B", js: [/Splitting\(\)|splitting-/], html: [/data-splitting/] }),
  S("Lenis", "Smooth scroll", "Darkroom's lightweight smooth-scroll library, used by many award-winning sites.", {
    website: "https://lenis.darkroom.engineering", color: "#FF98A2",
    js: [/lenisVersion|lenis-(?:smooth|stopped|scrolling)|new Lenis\(/], html: [/\blenis(?:-smooth)?\b|data-lenis-prevent/], css: [/\.lenis(?:\.lenis-smooth)?/], url: [/lenis(?:@([\d.]+))?(?:\/dist)?\/lenis(?:\.min)?\.js|\/lenis(?:\.min)?\.js/i],
    version: [/lenisVersion\s*=\s*["'`]([\d.]+)["'`]/, /lenis@(\d+\.\d+\.\d+)/],
  }),
  S("Locomotive Scroll", "Smooth scroll", "Smooth scrolling with parallax and in-view detection.", { website: "https://scroll.locomotive.ca", color: "#FF4D00", js: [/LocomotiveScroll|locomotive-scroll/], html: [/data-scroll-container|data-scroll-section/] }),
  S("Smooth Scrollbar", "Smooth scroll", "Customizable smooth scrollbar.", { website: "https://idiotwu.github.io/smooth-scrollbar/", color: "#666666", js: [/smooth-scrollbar|scrollbar-track-y/] }),
  S("fullPage.js", "Smooth scroll", "Full-screen scroll-snapping sections.", { website: "https://alvarotrigo.com/fullPage/", color: "#0198E1", js: [/fullpage_api|fp-viewing-/], url: [/fullpage(?:\.min)?\.(?:js|css)/] }),
  S("Barba.js", "Page transitions", "Smooth animated transitions between pages.", { website: "https://barba.js.org", color: "#FF6E6E", html: [/data-barba=/], js: [/@barba\/core|data-barba/] }),
  S("Swup", "Page transitions", "Page-transition library.", { website: "https://swup.js.org", color: "#9A5CFF", html: [/id="swup"|class="[^"]*transition-fade/], js: [/swup/i] }),
  S("Taxi.js", "Page transitions", "Page transitions from Unseen Studio (Highway's successor).", { website: "https://taxi.js.org", color: "#FFD600", html: [/data-taxi(?:-view)?=/], js: [/@unseenco\/taxi|data-taxi/] }),
  S("Highway", "Page transitions", "Dogstudio's page-transition router.", { website: "https://github.com/Dogstudio/highway", color: "#000000", html: [/data-router-wrapper|data-router-view/], js: [/@dogstudio\/highway/] }),
  S("View Transitions API", "Page transitions", "Native browser API for animated DOM and page transitions.", { website: "https://developer.mozilla.org/docs/Web/API/View_Transition_API", color: "#4285F4", js: [/startViewTransition\(/], css: [/view-transition-name|::view-transition|@view-transition/] }),

  // ── 3D, WebGL, creative coding, vector animation ─────────────────────────────────────────────────────────────
  S("three.js", "3D & WebGL", "The most popular JavaScript 3D library (WebGL / WebGPU).", {
    website: "https://threejs.org", color: "#049EF4",
    js: [/Multiple instances of Three\.js|__THREE__|THREE\.WebGLRenderer|WebGLRenderer: /], url: [/three(?:@(\d[\d.]*))?(?:\/build)?\/three(?:\.module)?(?:\.min)?\.js|\/three[.-]/i],
    version: [/REVISION\s*=\s*["'`](\d{2,3})(?:dev)?["'`]/, /three@0\.(\d{2,3})/, /"(\d{3})dev"/],
  }),
  S("React Three Fiber", "3D & WebGL", "React renderer for three.js (R3F).", { website: "https://r3f.docs.pmnd.rs", color: "#000000", js: [/__r3f|@react-three\/fiber|R3F:/], implies: ["three.js", "React"] }),
  S("OGL", "3D & WebGL", "Minimal WebGL library by Nathan Gordon, favoured on creative sites.", { website: "https://oframe.github.io/ogl/", color: "#6E6E6E", js: [/\bOGL\b|ogl\/src|Renderer: Attempting to render/], url: [/\/ogl(?:@[\d.]+)?\//] }),
  S("PixiJS", "3D & WebGL", "Fast 2D WebGL/WebGPU renderer.", { website: "https://pixijs.com", color: "#E72264", js: [/__PIXI_APP__|PixiJS|pixi\.js/], version: [/PixiJS (\d+\.\d+\.\d+)/] }),
  S("Babylon.js", "3D & WebGL", "Microsoft's 3D game and rendering engine.", { website: "https://www.babylonjs.com", color: "#BB464B", js: [/BABYLON\.|babylonjs/], version: [/Babylon\.js v(\d+\.\d+\.\d+)/] }),
  S("PlayCanvas", "3D & WebGL", "WebGL game engine and editor.", { website: "https://playcanvas.com", color: "#E05F2C", js: [/playcanvas|pc\.Application\(/], url: [/playcanvas/] }),
  S("Spline", "3D & WebGL", "Browser-based 3D design tool with an embeddable runtime.", { website: "https://spline.design", color: "#000000", html: [/<spline-viewer|prod\.spline\.design/], js: [/@splinetool\/runtime|prod\.spline\.design/] }),
  S("curtains.js", "3D & WebGL", "Turns HTML images and videos into WebGL planes.", { website: "https://www.curtainsjs.com", color: "#000000", js: [/curtainsjs|Curtains: /] }),
  S("Unicorn Studio", "3D & WebGL", "No-code WebGL effects for websites.", { website: "https://www.unicorn.studio", color: "#000000", html: [/unicornstudio|data-us-project/], js: [/unicornstudio/i] }),
  S("WebGPU", "3D & WebGL", "Next-generation GPU API in the browser.", { website: "https://developer.mozilla.org/docs/Web/API/WebGPU_API", color: "#005A9C", js: [/navigator\.gpu\.requestAdapter|GPUBufferUsage\./] }),
  S("Matter.js", "Creative coding", "2D rigid-body physics engine.", { website: "https://brm.io/matter-js/", color: "#76F09B", js: [/Matter\.Engine|matter-js/] }),
  S("p5.js", "Creative coding", "Creative-coding library (Processing for the web).", { website: "https://p5js.org", color: "#ED225D", url: [/p5(?:@[\d.]+)?(?:\/lib)?\/p5(?:\.min)?\.js/], js: [/p5\.prototype\./] }),
  S("Rive", "Vector animation", "Interactive, state-machine driven vector animations.", {
    website: "https://rive.app", color: "#1D1D1D",
    js: [/@rive-app|rive\.wasm|rive_fallback|StateMachineInput|\.riv["']/], html: [/\.riv["'?]|@rive-app/], url: [/\.riv(?:\?|$)|@rive-app/],
    version: [/@rive-app\/[\w-]+@(\d+\.\d+\.\d+)/],
  }),
  S("Lottie", "Vector animation", "After Effects animations exported as JSON (Bodymovin).", {
    website: "https://airbnb.io/lottie/", color: "#00DDB3",
    js: [/bodymovin|lottie-web|loadAnimation\(\{|dotlottie/], html: [/<lottie-player|<dotlottie-(?:player|wc)|data-animation-path/], url: [/lottie(?:-player|-web)?(?:\.min)?\.js|\.lottie(?:\?|$)/i],
  }),

  // ── Hosting, CDN, web servers ────────────────────────────────────────────────────────────────────────────────
  S("Vercel", "Hosting", "Frontend cloud for Next.js and other frameworks.", { website: "https://vercel.com", color: "#000000", headers: [["x-vercel-id", /./], ["server", /^Vercel$/i], ["x-vercel-cache", /./]] }),
  S("Netlify", "Hosting", "Jamstack hosting with edge functions.", { website: "https://www.netlify.com", color: "#00C7B7", headers: [["x-nf-request-id", /./], ["server", /Netlify/i]] }),
  S("Cloudflare", "CDN", "CDN, DNS and security proxy.", { website: "https://www.cloudflare.com", color: "#F38020", headers: [["cf-ray", /./], ["server", /cloudflare/i]], cookies: [/^__cf_bm$|^__cflb$/] }),
  S("Cloudflare Pages", "Hosting", "Cloudflare's static and full-stack hosting.", { website: "https://pages.cloudflare.com", color: "#F38020", headers: [["x-pages-deployment", /./]], url: [/\.pages\.dev\//] }),
  S("Amazon CloudFront", "CDN", "AWS content delivery network.", { website: "https://aws.amazon.com/cloudfront/", color: "#8C4FFF", headers: [["x-amz-cf-id", /./], ["via", /CloudFront/]] }),
  S("Amazon S3", "Hosting", "AWS object storage serving static files.", { website: "https://aws.amazon.com/s3/", color: "#569A31", headers: [["server", /AmazonS3/], ["x-amz-bucket-region", /./]] }),
  S("AWS Elastic Load Balancing", "Hosting", "AWS load balancer in front of servers.", { website: "https://aws.amazon.com/elasticloadbalancing/", color: "#FF9900", cookies: [/^AWSALB(?:CORS)?$|^AWSELB$/], headers: [["server", /awselb/]] }),
  S("AWS Amplify", "Hosting", "AWS hosting for web apps.", { website: "https://aws.amazon.com/amplify/", color: "#FF9900", url: [/\.amplifyapp\.com/] }),
  S("Fastly", "CDN", "Edge cloud and CDN.", { website: "https://www.fastly.com", color: "#FF282D", headers: [["x-fastly-request-id", /./], ["x-served-by", /cache-[a-z]{3}/], ["fastly-debug-digest", /./]] }),
  S("Akamai", "CDN", "Enterprise CDN and security.", { website: "https://www.akamai.com", color: "#0096D6", headers: [["x-akamai-transformed", /./], ["server", /AkamaiGHost|AkamaiNetStorage/], ["akamai-grn", /./]], cookies: [/^ak_bmsc$|^bm_sv$|^_abck$/] }),
  S("Bunny CDN", "CDN", "Low-cost global CDN.", { website: "https://bunny.net", color: "#FF7854", headers: [["server", /BunnyCDN/], ["cdn-pullzone", /./]] }),
  S("Google Cloud", "Hosting", "Google Cloud load balancer or App Engine.", { website: "https://cloud.google.com", color: "#4285F4", headers: [["server", /Google Frontend|gws|ESF/], ["via", /1\.1 google/]] }),
  S("Firebase Hosting", "Hosting", "Google's static and dynamic hosting.", { website: "https://firebase.google.com/products/hosting", color: "#FFCA28", headers: [["x-firebase-hosting", /./]], url: [/\.web\.app\/|\.firebaseapp\.com\//] }),
  S("GitHub Pages", "Hosting", "Static hosting from GitHub repositories.", { website: "https://pages.github.com", color: "#222222", headers: [["server", /GitHub\.com/], ["x-github-request-id", /./]] }),
  S("Render", "Hosting", "Cloud platform for web services.", { website: "https://render.com", color: "#46E3B7", headers: [["x-render-origin-server", /./], ["rndr-id", /./]] }),
  S("Fly.io", "Hosting", "Runs apps close to users worldwide.", { website: "https://fly.io", color: "#7B3BE2", headers: [["fly-request-id", /./], ["server", /^Fly\//]] }),
  S("Heroku", "Hosting", "Salesforce's platform as a service.", { website: "https://www.heroku.com", color: "#430098", headers: [["via", /vegur|heroku-router/i], ["nel", /heroku/]] }),
  S("Microsoft Azure", "Hosting", "Microsoft cloud (App Service, Front Door).", { website: "https://azure.microsoft.com", color: "#0078D4", headers: [["x-azure-ref", /./], ["x-ms-request-id", /./]], cookies: [/^ARRAffinity/] }),
  S("WP Engine", "Hosting", "Managed WordPress hosting.", { website: "https://wpengine.com", color: "#0ECAD4", headers: [["x-powered-by", /WP Engine/], ["wpe-backend", /./]] }),
  S("Kinsta", "Hosting", "Managed WordPress hosting on Google Cloud.", { website: "https://kinsta.com", color: "#5333ED", headers: [["x-kinsta-cache", /./]] }),
  S("Pantheon", "Hosting", "WebOps platform for Drupal and WordPress.", { website: "https://pantheon.io", color: "#FFDC28", headers: [["x-pantheon-styx-hostname", /./]] }),
  S("Hostinger", "Hosting", "Shared and cloud hosting.", { website: "https://www.hostinger.com", color: "#673DE6", headers: [["platform", /hostinger/i], ["panel", /hpanel/i]] }),
  S("Railway", "Hosting", "Infrastructure platform for apps.", { website: "https://railway.com", color: "#0B0D0E", headers: [["x-railway-request-id", /./], ["server", /railway/i]] }),
  S("Sucuri", "Security", "Website firewall and CDN.", { website: "https://sucuri.net", color: "#1D9B4B", headers: [["x-sucuri-id", /./], ["server", /Sucuri/]] }),
  S("Imperva", "Security", "Web application firewall (Incapsula).", { website: "https://www.imperva.com", color: "#2E3F8B", headers: [["x-iinfo", /./], ["x-cdn", /Imperva|Incapsula/]], cookies: [/^incap_ses_|^visid_incap_/] }),
  S("nginx", "Web server", "High-performance web server and reverse proxy.", { website: "https://nginx.org", color: "#009639", headers: [["server", /^nginx(?:\/([\d.]+))?/i]] }),
  S("OpenResty", "Web server", "nginx bundled with LuaJIT.", { website: "https://openresty.org", color: "#39A0A8", headers: [["server", /openresty(?:\/([\d.]+))?/i]] }),
  S("Apache HTTP Server", "Web server", "The Apache web server.", { website: "https://httpd.apache.org", color: "#D22128", headers: [["server", /^Apache(?:\/([\d.]+))?/i]] }),
  S("LiteSpeed", "Web server", "High-performance web server popular with WordPress hosts.", { website: "https://www.litespeedtech.com", color: "#0E6DBF", headers: [["server", /LiteSpeed/i], ["x-litespeed-cache", /./]] }),
  S("Caddy", "Web server", "Web server with automatic HTTPS.", { website: "https://caddyserver.com", color: "#1F88C0", headers: [["server", /^Caddy/i]] }),
  S("Microsoft IIS", "Web server", "Microsoft's Windows web server.", { website: "https://www.iis.net", color: "#0078D4", headers: [["server", /Microsoft-IIS(?:\/([\d.]+))?/]] }),
  S("Envoy", "Web server", "Cloud-native edge and service proxy.", { website: "https://www.envoyproxy.io", color: "#AC6199", headers: [["server", /^envoy$/i], ["x-envoy-upstream-service-time", /./]] }),

  // ── Backend languages and frameworks (inferred) ──────────────────────────────────────────────────────────────
  S("PHP", "Language", "Server-side scripting language.", { website: "https://www.php.net", color: "#777BB4", headers: [["x-powered-by", /PHP(?:\/([\d.]+))?/]], cookies: [/^PHPSESSID$/], url: [/\.php(?:\?|$)/], confidence: "medium" }),
  S("MySQL", "Backend", "Relational database (implied by WordPress and similar CMSs).", { website: "https://www.mysql.com", color: "#4479A1", confidence: "low" }),
  S("Laravel", "Backend", "PHP web framework.", { website: "https://laravel.com", color: "#FF2D20", cookies: [/^laravel_session$/], confidence: "medium", implies: ["PHP"] }),
  S("Symfony", "Backend", "PHP framework and components.", { website: "https://symfony.com", color: "#000000", headers: [["x-debug-token", /./]], cookies: [/^sf_redirect$/], confidence: "low", implies: ["PHP"] }),
  S("Django", "Backend", "Python web framework.", { website: "https://www.djangoproject.com", color: "#092E20", cookies: [/^csrftoken$|^django_language$/], html: [/name="csrfmiddlewaretoken"/], confidence: "medium", implies: ["Python"] }),
  S("Flask", "Backend", "Python micro-framework.", { website: "https://flask.palletsprojects.com", color: "#3BABC3", headers: [["server", /Werkzeug(?:\/([\d.]+))?/]], implies: ["Python"] }),
  S("Python", "Language", "General-purpose language used for web backends.", { website: "https://www.python.org", color: "#3776AB", headers: [["server", /gunicorn|uvicorn|Werkzeug|Python\//i]], confidence: "medium" }),
  S("Ruby on Rails", "Backend", "Ruby web framework.", { website: "https://rubyonrails.org", color: "#D30001", headers: [["x-runtime", /^\d+\.\d+$/]], html: [/name="csrf-param" content="authenticity_token"/], confidence: "medium", implies: ["Ruby"] }),
  S("Ruby", "Language", "Dynamic language behind Rails.", { website: "https://www.ruby-lang.org", color: "#CC342D", headers: [["server", /Phusion Passenger|Puma|Unicorn/i]], confidence: "medium" }),
  S("Express", "Backend", "Minimal Node.js web framework.", { website: "https://expressjs.com", color: "#000000", headers: [["x-powered-by", /^Express$/]], cookies: [/^connect\.sid$/], implies: ["Node.js"] }),
  S("ASP.NET", "Backend", "Microsoft's .NET web framework.", { website: "https://dotnet.microsoft.com/apps/aspnet", color: "#512BD4", headers: [["x-powered-by", /ASP\.NET/], ["x-aspnet-version", /([\d.]+)/], ["x-aspnetmvc-version", /./]], cookies: [/^ASP\.NET_SessionId$|^\.AspNetCore\./], html: [/__VIEWSTATE|__RequestVerificationToken/] }),
  S("Java", "Language", "JVM backends (Spring, Tomcat, JSP).", { website: "https://www.java.com", color: "#ED8B00", cookies: [/^JSESSIONID$/], headers: [["x-powered-by", /Servlet|JSP|Tomcat/i], ["server", /Tomcat|Jetty|WildFly/i]], confidence: "medium" }),
  S("Elixir", "Language", "Functional language on the Erlang VM.", { website: "https://elixir-lang.org", color: "#4B275F", cookies: [/^_[\w]+_key$/], confidence: "low" }),
  S("CodeIgniter", "Backend", "Lightweight PHP framework.", { website: "https://codeigniter.com", color: "#EE4323", cookies: [/^ci_session$/], implies: ["PHP"] }),

  // ── Third-party services (analytics, consent, support, auth, payments, search, media) ─────────────────────────
  S("Google Tag Manager", "Tag management", "Google's tag management system.", { website: "https://tagmanager.google.com", color: "#246FDB", html: [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,12}/] }),
  S("Google Analytics", "Analytics", "Google Analytics 4 via gtag.js.", { website: "https://analytics.google.com", color: "#E37400", html: [/googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*["']config["']\s*,\s*["']G-/] }),
  S("Meta Pixel", "Advertising", "Meta (Facebook) conversion tracking.", { website: "https://www.facebook.com/business/tools/meta-pixel", color: "#0668E1", html: [/connect\.facebook\.net\/[\w_]+\/fbevents\.js|fbq\(\s*["']init/] }),
  S("Segment", "Analytics", "Customer data platform.", { website: "https://segment.com", color: "#52BD95", html: [/cdn\.segment\.(?:com|io)\/analytics\.js/] }),
  S("Vercel Analytics", "Analytics", "Privacy-friendly analytics from Vercel.", { website: "https://vercel.com/analytics", color: "#000000", html: [/\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com/], js: [/\/_vercel\/insights\/(?:script\.js|view)/] }),
  S("Vercel Speed Insights", "Monitoring", "Real-user Core Web Vitals from Vercel.", { website: "https://vercel.com/docs/speed-insights", color: "#000000", html: [/\/_vercel\/speed-insights\/script\.js/], js: [/\/_vercel\/speed-insights\//] }),
  S("Cloudflare Web Analytics", "Analytics", "Privacy-first analytics from Cloudflare.", { website: "https://www.cloudflare.com/web-analytics/", color: "#F38020", html: [/static\.cloudflareinsights\.com\/beacon/] }),
  S("Plausible", "Analytics", "Lightweight, cookieless analytics.", { website: "https://plausible.io", color: "#5850EC", html: [/plausible\.io\/js\/|data-domain="[^"]+"[^>]*plausible/] }),
  S("Fathom", "Analytics", "Privacy-focused analytics.", { website: "https://usefathom.com", color: "#8E82FF", html: [/cdn\.usefathom\.com/] }),
  S("Umami", "Analytics", "Open-source, cookieless analytics.", { website: "https://umami.is", color: "#000000", html: [/data-website-id="[0-9a-f-]{36}"[^>]*(?:umami|script\.js)|umami\.is|cloud\.umami/] }),
  S("PostHog", "Analytics", "Product analytics, session replay and feature flags.", { website: "https://posthog.com", color: "#F54E00", html: [/posthog\.init|i\.posthog\.com|us-assets\.i\.posthog\.com/], js: [/posthog\.init\(|i\.posthog\.com/] }),
  S("Mixpanel", "Analytics", "Product analytics.", { website: "https://mixpanel.com", color: "#7856FF", html: [/cdn\.mxpnl\.com|mixpanel\.init/], js: [/api-js\.mixpanel\.com/] }),
  S("Amplitude", "Analytics", "Product analytics.", { website: "https://amplitude.com", color: "#1E61F0", html: [/cdn\.amplitude\.com/], js: [/api2\.amplitude\.com/] }),
  S("Hotjar", "Analytics", "Heatmaps and session recordings.", { website: "https://www.hotjar.com", color: "#FF3C00", html: [/static\.hotjar\.com|hotjar\.com\/c\/hotjar-/] }),
  S("Microsoft Clarity", "Analytics", "Free heatmaps and session replay.", { website: "https://clarity.microsoft.com", color: "#0078D4", html: [/clarity\.ms\/tag/] }),
  S("LinkedIn Insight Tag", "Advertising", "LinkedIn conversion tracking.", { website: "https://business.linkedin.com/marketing-solutions/insight-tag", color: "#0A66C2", html: [/snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/] }),
  S("TikTok Pixel", "Advertising", "TikTok conversion tracking.", { website: "https://ads.tiktok.com", color: "#000000", html: [/analytics\.tiktok\.com\/i18n\/pixel/] }),
  S("Sentry", "Monitoring", "Error and performance monitoring.", { website: "https://sentry.io", color: "#362D59", html: [/browser\.sentry-cdn\.com|js\.sentry-cdn\.com/], js: [/sentry\.io\/api|__SENTRY__|ingest\.(?:us\.)?sentry\.io/] }),
  S("Datadog RUM", "Monitoring", "Real-user monitoring from Datadog.", { website: "https://www.datadoghq.com", color: "#632CA6", html: [/datadoghq-browser-agent\.com/], js: [/browser-intake-datadoghq/] }),
  S("LogRocket", "Monitoring", "Session replay and product analytics.", { website: "https://logrocket.com", color: "#764ABC", html: [/cdn\.(?:lr-ingest|logrocket)\.(?:io|com)/] }),
  S("OneTrust", "Consent", "Cookie consent and privacy management.", { website: "https://www.onetrust.com", color: "#6CC04A", html: [/cdn\.cookielaw\.org|otSDKStub|optanon/i] }),
  S("Cookiebot", "Consent", "Cookie consent manager by Usercentrics.", { website: "https://www.cookiebot.com", color: "#1032CF", html: [/consent\.cookiebot\.com/] }),
  S("Usercentrics", "Consent", "Consent management platform.", { website: "https://usercentrics.com", color: "#0045A5", html: [/app\.usercentrics\.eu|web\.cmp\.usercentrics\.eu/] }),
  S("CookieYes", "Consent", "Cookie consent banner.", { website: "https://www.cookieyes.com", color: "#1863DC", html: [/cdn-cookieyes\.com/] }),
  S("Intercom", "Customer support", "Customer messaging platform.", { website: "https://www.intercom.com", color: "#1F8DED", html: [/widget\.intercom\.io|js\.intercomcdn\.com/] }),
  S("Crisp", "Customer support", "Live chat widget.", { website: "https://crisp.chat", color: "#1972F5", html: [/client\.crisp\.chat/] }),
  S("Zendesk", "Customer support", "Help desk and chat.", { website: "https://www.zendesk.com", color: "#03363D", html: [/static\.zdassets\.com|zopim/] }),
  S("HubSpot", "Customer support", "CRM, forms and marketing automation.", { website: "https://www.hubspot.com", color: "#FF7A59", html: [/js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/] }),
  S("Calendly", "Customer support", "Scheduling embeds.", { website: "https://calendly.com", color: "#006BFF", html: [/assets\.calendly\.com|calendly\.com\/[\w-]+/] }),
  S("Google reCAPTCHA", "Security", "Bot protection for forms.", { website: "https://www.google.com/recaptcha/", color: "#4A90E2", html: [/google\.com\/recaptcha\/|recaptcha\/api\.js/] }),
  S("hCaptcha", "Security", "Privacy-focused CAPTCHA.", { website: "https://www.hcaptcha.com", color: "#0074BF", html: [/hcaptcha\.com\/1\/api\.js/] }),
  S("Cloudflare Turnstile", "Security", "CAPTCHA alternative from Cloudflare.", { website: "https://www.cloudflare.com/products/turnstile/", color: "#F38020", html: [/challenges\.cloudflare\.com\/turnstile/] }),
  S("Clerk", "Auth", "User management and authentication.", { website: "https://clerk.com", color: "#6C47FF", html: [/clerk\.[\w.-]+\/npm\/@clerk|__clerk_/], js: [/@clerk\/clerk-js|clerk\.accounts\.dev/] }),
  S("Auth0", "Auth", "Identity platform by Okta.", { website: "https://auth0.com", color: "#EB5424", js: [/\.auth0\.com\/authorize|auth0-spa-js/] }),
  S("Firebase", "Backend", "Google's app backend (auth, database, storage).", { website: "https://firebase.google.com", color: "#FFCA28", js: [/firebaseapp\.com|firebaseio\.com|firestore\.googleapis\.com/] }),
  S("Supabase", "Backend", "Open-source Postgres backend with auth and storage.", { website: "https://supabase.com", color: "#3FCF8E", js: [/\.supabase\.co\b/], html: [/\.supabase\.co\//] }),
  S("Stripe", "Payments", "Online payments.", { website: "https://stripe.com", color: "#635BFF", html: [/js\.stripe\.com/], js: [/js\.stripe\.com|api\.stripe\.com/] }),
  S("PayPal", "Payments", "Online payments.", { website: "https://www.paypal.com", color: "#003087", html: [/paypal\.com\/sdk\/js|paypalobjects\.com/] }),
  S("Razorpay", "Payments", "Payments for India.", { website: "https://razorpay.com", color: "#0C2451", html: [/checkout\.razorpay\.com/] }),
  S("Algolia", "Search", "Hosted search API.", { website: "https://www.algolia.com", color: "#003DFF", js: [/algolianet\.com|algolia\.net|algoliasearch/] }),
  S("Cloudinary", "Media", "Image and video CDN with transformations.", { website: "https://cloudinary.com", color: "#3448C5", html: [/res\.cloudinary\.com/] }),
  S("imgix", "Media", "Real-time image processing CDN.", { website: "https://www.imgix.com", color: "#F57C00", html: [/\.imgix\.net/] }),
  S("Next.js Image Optimization", "Media", "Next.js on-demand responsive images.", { website: "https://nextjs.org/docs/app/api-reference/components/image", color: "#000000", html: [/\/_next\/image\?url=/], implies: ["Next.js"] }),
  S("Mux", "Media", "Video streaming API.", { website: "https://www.mux.com", color: "#FA50B5", html: [/stream\.mux\.com|image\.mux\.com|<mux-(?:player|video)/], js: [/stream\.mux\.com/] }),
  S("Vimeo", "Media", "Video hosting and player.", { website: "https://vimeo.com", color: "#1AB7EA", html: [/player\.vimeo\.com/] }),
  S("YouTube", "Media", "Embedded YouTube videos.", { website: "https://www.youtube.com", color: "#FF0000", html: [/youtube(?:-nocookie)?\.com\/embed\//] }),
  S("Google Fonts", "Font service", "Free hosted web fonts.", { website: "https://fonts.google.com", color: "#4285F4", url: [/fonts\.googleapis\.com|fonts\.gstatic\.com/] }),
  S("Adobe Fonts", "Font service", "Typekit font library for Creative Cloud.", { website: "https://fonts.adobe.com", color: "#EB1000", url: [/use\.typekit\.net|p\.typekit\.net/] }),
  S("Fontshare", "Font service", "Free fonts from Indian Type Foundry.", { website: "https://www.fontshare.com", color: "#000000", url: [/api\.fontshare\.com|cdn\.fontshare\.com/] }),
  S("Bunny Fonts", "Font service", "Privacy-friendly Google Fonts mirror.", { website: "https://fonts.bunny.net", color: "#FF7854", url: [/fonts\.bunny\.net/] }),
  S("Monotype Fonts", "Font service", "Fonts.com / Monotype web fonts.", { website: "https://www.monotype.com", color: "#E2231A", url: [/fast\.fonts\.net|fonts\.com\//] }),
];

/** Cookie names → what they reveal about the backend. */
export const COOKIE_HINTS: [RegExp, string][] = [
  [/^PHPSESSID$/, "PHP session"], [/^laravel_session$/, "Laravel session"], [/^XSRF-TOKEN$/, "CSRF token (Laravel, Angular)"],
  [/^ASP\.NET_SessionId$|^\.AspNetCore\./, "ASP.NET session"], [/^JSESSIONID$/, "Java servlet session"], [/^connect\.sid$/, "Express session"],
  [/^csrftoken$|^sessionid$/, "Django"], [/^ci_session$/, "CodeIgniter session"], [/^wordpress_|^wp-settings/, "WordPress"],
  [/^_shopify_|^cart_sig$|^secure_customer_sig$/, "Shopify"], [/^__cf_bm$/, "Cloudflare bot management"], [/^__cflb$/, "Cloudflare load balancer"],
  [/^AWSALB|^AWSELB/, "AWS load balancer stickiness"], [/^ARRAffinity/, "Azure App Service affinity"], [/^incap_ses_|^visid_incap_/, "Imperva WAF"],
  [/^ak_bmsc$|^bm_sv$|^_abck$/, "Akamai Bot Manager"], [/^CRAFT_CSRF_TOKEN$/, "Craft CMS"], [/^_vercel_jwt$/, "Vercel deployment protection"],
  [/^__Host-next-auth|^next-auth\.|^__Secure-next-auth/, "NextAuth.js / Auth.js"], [/^__session$|^__client_uat/, "Clerk session"], [/^_ga/, "Google Analytics"],
];
