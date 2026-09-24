"use client";

import { useEffect, useRef } from "react";

/** Apple-style sheet: centered card on desktop, bottom sheet on phones. Closes on Esc, backdrop click or Done. */
export function Sheet({ title, subtitle, onClose, children, wide = false, actions }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  actions?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1} ref={panel}>
        <span className="grabber" aria-hidden="true" />
        <header className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="sheet-actions">
            {actions}
            <button type="button" className="text-btn strong" onClick={onClose}>Done</button>
          </div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
