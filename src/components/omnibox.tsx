"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { understand, type Suggestion, type Tool } from "@/lib/intent";
import { Icon, ProductGlyph, useSiteContext } from "./chrome";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP);

/**
 * The omnibox: one search that works out what you typed (a website, a tag ID, pasted page source or a question), then
 * confirms what to spy on before going anywhere. Used as the landing page's hero and as a ⌘K palette on every page.
 */

export const OPEN_OMNIBOX = "tagspy:omnibox";

const EXAMPLES = ["stripe.com", "Is linear.app built with AI?", "GTM-N233G8C", "What fonts does apple.com use?", "facebook pixel on nike.com", "What does allbirds.com track?"];
const TRY: { text: string; note: string }[] = [
  { text: "Is linear.app built with AI?", note: "AI detection" },
  { text: "What fonts does stripe.com use?", note: "Tech stack & fonts" },
  { text: "GTM-N233G8C", note: "Open a container" },
  { text: "What does allbirds.com track?", note: "Tags & pixels" },
];

function ToolGlyph({ tool }: { tool: Tool }) {
  if (tool === "ai") return <span className="glyph g-purple"><Icon name="neurology" fill /></span>;
  return <ProductGlyph kind={tool} />;
}

const LABEL_ICON = (label: string) => (/source/i.test(label) ? "code" : /container|ID|key|tag/i.test(label) ? "sell" : "language");

export function Omnibox({ variant = "hero", autoFocus = false, onNavigate }: { variant?: "hero" | "palette"; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const context = useSiteContext();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(variant === "palette");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const listId = useId();
  const result = useMemo(() => understand(value), [value]);

  // Empty: examples to try (and the site you were last looking at). Typed: what we understood.
  const rows: { key: string; suggestion?: Suggestion; example?: { text: string; note: string } }[] = result
    ? result.suggestions.map((suggestion) => ({ key: suggestion.href, suggestion }))
    : [...(context.site ? [{ text: context.site, note: "Continue where you left off" }] : []), ...TRY].map((example) => ({ key: example.text, example }));
  const current = Math.min(active, Math.max(0, rows.length - 1));
  const expanded = open && (rows.length > 0 || !!result);

  const go = useCallback((suggestion: Suggestion) => {
    setOpen(false);
    onNavigate?.();
    router.push(suggestion.href);
  }, [router, onNavigate]);

  const pick = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.suggestion) go(row.suggestion);
    else if (row.example) { setValue(row.example.text); setActive(0); input.current?.focus(); }
  };

  const shake = () => { if (root.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(root.current.querySelector(".omni-field"), { x: -8 }, { x: 0, duration: 0.6, ease: "elastic.out(1.2, 0.3)" }); };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (rows.length) setActive((current + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[current]) pick(current); else shake();
    } else if (event.key === "Tab" && result?.target?.type === "site" && result.target.guessed) {
      event.preventDefault();
      setValue(result.target.host);
    } else if (event.key === "Escape") {
      if (value) setValue(""); else { setOpen(false); onNavigate?.(); }
    }
  };

  // Typewriter placeholder while the box is empty.
  useGSAP(() => {
    const field = input.current;
    if (!field || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const state = { n: 0 };
    const tl = gsap.timeline({ repeat: -1, delay: 1.2 });
    for (const example of EXAMPLES) {
      tl.to(state, { n: example.length, duration: example.length * 0.045, ease: "none", onUpdate: () => { field.placeholder = example.slice(0, Math.round(state.n)); } })
        .to({}, { duration: 1.6 })
        .to(state, { n: 0, duration: example.length * 0.018, ease: "none", onUpdate: () => { field.placeholder = example.slice(0, Math.round(state.n)); } })
        .to({}, { duration: 0.25 });
    }
    return () => { tl.kill(); field.placeholder = "Search a website, an ID, or ask a question"; };
  }, { scope: root });

  // The panel opens with a soft drop; rows arrive in a quick cascade whenever the question changes.
  const headline = result?.headline ?? "empty";
  useGSAP(() => {
    if (!expanded || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".omni-row", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.035, overwrite: true });
  }, { scope: root, dependencies: [expanded, headline] });
  useGSAP(() => {
    if (!expanded || variant === "palette" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".omni-panel", { opacity: 0, y: -8, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "expo.out" });
  }, { scope: root, dependencies: [expanded] });

  // The highlight glides to the active row.
  useEffect(() => {
    const row = list.current?.children[current] as HTMLElement | undefined;
    if (!row || !glow.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(glow.current, { y: row.offsetTop, height: row.offsetHeight, opacity: 1, duration: reduce ? 0 : 0.35, ease: "power3.out" });
  }, [current, rows.length, headline, expanded]);

  // Close the hero dropdown when clicking elsewhere.
  useEffect(() => {
    if (variant !== "hero") return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [variant]);

  useEffect(() => { if (autoFocus) input.current?.focus({ preventScroll: true }); }, [autoFocus]);

  const top = result?.suggestions[0];
  return (
    <div ref={root} className={`omni ${variant}${expanded ? " open" : ""}`}>
      <form className="omni-field spotlight" role="search" onSubmit={(event) => { event.preventDefault(); if (rows[current]) pick(current); else shake(); }}>
        <Icon name={result?.label ? LABEL_ICON(result.label) : "search"} className="omni-lead" />
        {result?.label && <span className="omni-chip mono" key={result.label}>{result.label}</span>}
        <label className="visually-hidden" htmlFor={`${listId}-input`}>Search a website, an ID, or ask a question</label>
        <input
          ref={input} id={`${listId}-input`} value={value} autoComplete="off" spellCheck={false}
          placeholder="Search a website, an ID, or ask a question"
          role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={expanded && rows[current] ? `${listId}-${current}` : undefined}
          onChange={(event) => { setValue(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        {variant === "palette" ? <kbd className="omni-esc">Esc</kbd> : (
          <button className="go" aria-label={top ? top.title : "Search"} disabled={!value.trim()}><Icon name="arrow_forward" /></button>
        )}
      </form>

      {expanded && (
        <div className="omni-panel">
          <div className="omni-head">
            <strong>{result ? result.headline : "Try one of these"}</strong>
            {result?.suggestions.length ? <span className="faint small">↑↓ to choose · Enter to spy</span> : null}
          </div>
          <div className="omni-list-wrap">
            <div ref={glow} className="omni-glow" aria-hidden="true" />
            <ul ref={list} id={listId} role="listbox" className="omni-list" aria-label={result?.headline ?? "Examples"}>
              {rows.map((row, index) => (
                <li
                  key={row.key} id={`${listId}-${index}`} role="option" aria-selected={index === current}
                  className={`omni-row${index === current ? " on" : ""}`}
                  onPointerMove={() => { if (index !== current) setActive(index); }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => pick(index)}
                >
                  {row.suggestion ? <ToolGlyph tool={row.suggestion.tool} /> : <span className="glyph g-blue"><Icon name={row.example!.note.startsWith("Continue") ? "history" : "north_east"} /></span>}
                  <span className="omni-row-text">
                    <strong>{row.suggestion?.title ?? row.example!.text}</strong>
                    <small>{row.suggestion?.detail ?? row.example!.note}</small>
                  </span>
                  {row.suggestion?.reason && index === 0 && <span className="omni-reason">{row.suggestion.reason}</span>}
                  {index === 0 && row.suggestion && !row.suggestion.reason && result?.target?.type === "site" && <span className="omni-reason soft">Best place to start</span>}
                  <kbd className="omni-enter" aria-hidden="true">↵</kbd>
                </li>
              ))}
            </ul>
          </div>
          {result?.hint && <p className="omni-hint small"><Icon name="lightbulb" className="sm" /> {result.hint}</p>}
        </div>
      )}
    </div>
  );
}

/** ⌘K / Ctrl+K (or "/") anywhere opens the omnibox as a palette; the nav's search button does too. */
export function OmniboxPalette() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setOpen((value) => !value); }
      else if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_OMNIBOX, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_OMNIBOX, onOpen); };
  }, []);

  // A navigation closes it.
  const [openedAt, setOpenedAt] = useState(path);
  if (open && openedAt !== path) { setOpen(false); setOpenedAt(path); }
  if (!open && openedAt !== path) setOpenedAt(path);

  useGSAP(() => {
    if (!open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(".omni-backdrop", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" });
    gsap.fromTo(".omni-sheet", { opacity: 0, y: -16, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "expo.out" });
  }, { scope: sheet, dependencies: [open] });

  if (!open) return null;
  return (
    <div ref={sheet} className="omni-layer" role="dialog" aria-modal="true" aria-label="Search TagSpy">
      <div className="omni-backdrop" onClick={() => setOpen(false)} />
      <div className="omni-sheet">
        <Omnibox variant="palette" autoFocus onNavigate={() => setOpen(false)} />
      </div>
    </div>
  );
}
