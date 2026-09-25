/**
 * Scripts injected into the page during a deep scan. They are plain JavaScript strings (not TypeScript functions)
 * so no transpiler helper can leak into the page. They only observe: nothing is sent anywhere, and every hook
 * calls through to the original implementation.
 */

/** Runs before any page script: counts WebGL contexts, shaders and draw calls, wheel listeners, and Web Vitals entries. */
export const INSTALL_PROBES = String.raw`(() => {
  const S = { contexts: [], shaders: 0, shaderSamples: [], drawCalls: 0, webgpu: false, wheel: 0, lcp: null, cls: 0, longTasks: 0, tbt: 0, renderers: [] };
  Object.defineProperty(window, "__tagspyProbe", { value: S, enumerable: false });

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl|webgpu/i.test(String(type)) && !this.__tagspyCounted) {
      Object.defineProperty(this, "__tagspyCounted", { value: true });
      S.contexts.push({ type: String(type), canvas: this });
    }
    return ctx;
  };
  for (const proto of [window.WebGLRenderingContext && WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
    if (!proto) continue;
    const shaderSource = proto.shaderSource;
    proto.shaderSource = function (shader, source) {
      S.shaders++;
      if (S.shaderSamples.length < 6) S.shaderSamples.push(String(source).slice(0, 1500));
      return shaderSource.call(this, shader, source);
    };
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = proto[name];
      if (original) proto[name] = function (...args) { S.drawCalls++; return original.apply(this, args); };
    }
  }
  if (navigator.gpu && navigator.gpu.requestAdapter) {
    const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = (...args) => { S.webgpu = true; return requestAdapter(...args); };
  }
  const addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === "wheel" || type === "mousewheel" || type === "DOMMouseScroll") S.wheel++;
    return addEventListener.call(this, type, ...rest);
  };
  // A stand-in React DevTools hook: React (and React Three Fiber) register their renderer, name and version with it.
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let id = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(), supportsFiber: true, isDisabled: false, checkDCE() {},
      inject(renderer) { id++; this.renderers.set(id, renderer); S.renderers.push({ name: renderer.rendererPackageName || "react", version: renderer.version || renderer.reconcilerVersion || null }); return id; },
      onCommitFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, setStrictMode() {},
    };
  }
  const observe = (type, callback) => { try { new PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({ type, buffered: true }); } catch (e) {} };
  observe("largest-contentful-paint", (entry) => { S.lcp = entry.startTime; });
  observe("layout-shift", (entry) => { if (!entry.hadRecentInput) S.cls += entry.value; });
  observe("longtask", (entry) => { S.longTasks++; S.tbt += Math.max(0, entry.duration - 50); });
})();`;

/** Web Vitals as they stand right after load, before the scripted scroll adds shifts and long tasks of its own. */
export const VITALS = String.raw`(() => { const S = window.__tagspyProbe; return S ? { lcp: S.lcp == null ? null : Math.round(S.lcp), cls: Math.round(S.cls * 1000) / 1000, longTasks: S.longTasks, tbt: Math.round(S.tbt) } : null; })()`;

/** Counts animations that are currently running (used for the reduced-motion comparison). */
export const COUNT_RUNNING = String.raw`(() => {
  const running = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running").length : 0;
  const cls = document.documentElement.className + " " + (document.body ? document.body.className : "");
  return { running, smooth: /\blenis\b|has-scroll-smooth|\bscroll-smooth\b|smooth-scrollbar/.test(cls) || !!document.querySelector("#smooth-wrapper, [data-scroll-container]"), contexts: (window.__tagspyProbe || { contexts: [] }).contexts.length };
})()`;

/** Collects everything after load and scrolling. Returns plain JSON. */
export const COLLECT = String.raw`(() => {
  const S = window.__tagspyProbe || { contexts: [], shaders: 0, shaderSamples: [], drawCalls: 0, webgpu: false, wheel: 0, lcp: null, cls: 0, longTasks: 0, tbt: 0, renderers: [] };
  const globals = [];
  const add = (name, version, detail) => { if (!globals.some((g) => g.name === name)) globals.push({ name, version: version == null ? null : String(version), detail: detail || null }); };
  const w = window;
  try {
    for (const r of S.renderers) {
      if (/react-dom/.test(r.name)) add("React", r.version, "react-dom renderer");
      else if (/react-three/.test(r.name)) add("React Three Fiber", r.version, r.name);
      else add(r.name === "react" ? "React" : r.name, r.version, "React renderer");
    }
    if (w.gsap) add("GSAP", w.gsap.version, w.gsap.plugins ? Object.keys(w.gsap.plugins).slice(0, 12).join(", ") : null);
    if (w.ScrollTrigger) add("GSAP ScrollTrigger", w.ScrollTrigger.version, w.ScrollTrigger.getAll ? w.ScrollTrigger.getAll().length + " triggers" : null);
    if (w.ScrollSmoother) add("GSAP ScrollSmoother", w.ScrollSmoother.version, null);
    if (w.SplitText) add("GSAP SplitText", w.SplitText.version, null);
    if (w.THREE) add("three.js", w.THREE.REVISION, "global THREE");
    else if (w.__THREE__) add("three.js", w.__THREE__, "registered revision");
    if (w.lenisVersion) add("Lenis", w.lenisVersion, null);
    if (w.next && w.next.version) add("Next.js", w.next.version, w.next.appDir ? "App Router" : "Pages Router");
    if (w.__NEXT_DATA__) add("Next.js", null, "build " + w.__NEXT_DATA__.buildId);
    if (w.__NUXT__ || w.__nuxt_app || w.$nuxt) add("Nuxt", null, null);
    if (w.__VUE__) { const app = document.querySelector("[data-v-app]"); add("Vue.js", app && app.__vue_app__ ? app.__vue_app__.version : null, null); }
    if (w.__svelte && w.__svelte.v) add("Svelte", Array.from(w.__svelte.v).join(", "), null);
    if (w.jQuery && w.jQuery.fn) add("jQuery", w.jQuery.fn.jquery, null);
    if (w.PIXI) add("PixiJS", w.PIXI.VERSION, null);
    if (w.BABYLON) add("Babylon.js", w.BABYLON.Engine && w.BABYLON.Engine.Version, null);
    if (w.anime) add("anime.js", w.anime.version, null);
    if (w.barba) add("Barba.js", w.barba.version, null);
    if (w.swup) add("Swup", null, null);
    if (w.lottie || w.bodymovin) add("Lottie", (w.lottie || w.bodymovin).version, null);
    if (w.rive) add("Rive", null, null);
    if (w.Alpine) add("Alpine.js", w.Alpine.version, null);
    if (w.htmx) add("htmx", w.htmx.version, null);
    if (w.Swiper) add("Swiper", null, null);
    if (w.Matter) add("Matter.js", w.Matter.version, null);
    if (w.p5) add("p5.js", w.p5.prototype && w.p5.prototype.VERSION, null);
    if (w.LocomotiveScroll) add("Locomotive Scroll", null, null);
    if (w.Webflow) add("Webflow", null, null);
    if (w.Shopify) add("Shopify", null, w.Shopify.theme && w.Shopify.theme.name ? "theme " + w.Shopify.theme.name : null);
    if (w.wp) add("WordPress", null, null);
    if (w.Framer || document.querySelector("[data-framer-name]")) add("Framer", null, null);
    if (customElements.get("spline-viewer")) add("Spline", null, "<spline-viewer>");
    if (customElements.get("dotlottie-player") || customElements.get("lottie-player") || customElements.get("dotlottie-wc")) add("Lottie", null, "player element");
    if (customElements.get("model-viewer")) add("model-viewer", null, "<model-viewer>");
  } catch (e) {}

  const fonts = [];
  try { document.fonts.forEach((f) => { if (f.status === "loaded" && fonts.length < 60) fonts.push({ family: f.family.replace(/^["']|["']$/g, ""), weight: String(f.weight), style: f.style }); }); } catch (e) {}

  const typeScale = [];
  for (const selector of ["h1", "h2", "h3", "p", "a", "button", "nav a", "li"]) {
    const el = Array.from(document.querySelectorAll(selector)).find((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (node.textContent || "").trim().length > 1; });
    if (!el) continue;
    const cs = getComputedStyle(el);
    typeScale.push({ selector, family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, transform: cs.textTransform });
  }

  const all = document.getAnimations ? document.getAnimations() : [];
  const names = new Set();
  let css = 0, transitions = 0, scripted = 0, running = 0;
  for (const a of all) {
    if (a.playState === "running") running++;
    if (a.constructor && a.constructor.name === "CSSAnimation") { css++; if (a.animationName) names.add(a.animationName); }
    else if (a.constructor && a.constructor.name === "CSSTransition") transitions++;
    else scripted++;
  }

  const root = document.documentElement;
  const cls = root.className + " " + (document.body ? document.body.className : "");
  const library = /\blenis\b/.test(cls) ? "Lenis" : /has-scroll-smooth|has-scroll-init/.test(cls) ? "Locomotive Scroll" : document.querySelector("#smooth-wrapper") ? "GSAP ScrollSmoother" : document.querySelector(".scrollbar-track") ? "Smooth Scrollbar" : null;
  const pageHeight = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
  // A custom scroll container (a Lenis or Locomotive wrapper, an overflow:auto <main>) is not scroll-jacking.
  let container = null;
  for (const node of Array.from(document.querySelectorAll("body *")).slice(0, 3000)) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 200 && node.clientHeight > innerHeight * 0.5) {
      container = node.tagName.toLowerCase() + (node.id ? "#" + node.id : "") + (typeof node.className === "string" && node.className.trim() ? "." + node.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
      break;
    }
  }
  const contentHeight = Math.max(...Array.from(document.querySelectorAll("body *")).slice(0, 4000).map((node) => node.getBoundingClientRect().bottom + window.scrollY), 0);

  const nav = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return {
    globals,
    fonts,
    typeScale,
    webgl: { contexts: S.contexts.map((c) => ({ type: c.type, width: c.canvas.width, height: c.canvas.height })), shaders: S.shaders, shaderSamples: S.shaderSamples, drawCalls: S.drawCalls, webgpu: S.webgpu },
    animations: { total: all.length, running, css, transitions, scripted, names: Array.from(names).slice(0, 20) },
    scroll: { library, container, virtual: !container && S.wheel > 0 && pageHeight <= innerHeight + 20 && contentHeight > innerHeight * 1.5, wheelListeners: S.wheel, pageHeight },
    vitals: {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: S.lcp == null ? null : Math.round(S.lcp),
      cls: Math.round(S.cls * 1000) / 1000,
      longTasks: S.longTasks,
      totalBlockingTime: Math.round(S.tbt),
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
      jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    },
  };
})()`;
