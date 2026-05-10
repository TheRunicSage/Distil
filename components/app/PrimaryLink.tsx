"use client";

// Primary CTA Link with click-ripple feedback. Drop-in replacement for
// `<Link className="btn-primary">…</Link>` on landing/marketing surfaces
// where the polish reads. The ripple positions itself at the cursor xy
// (or touch xy) and runs once via the `data-ripple` attribute swap;
// keyframes + position vars are defined in globals.css.

import Link, { type LinkProps } from "next/link";
import { useCallback, useRef, type ReactNode } from "react";

type Props = LinkProps & {
  children: ReactNode;
  className?: string;
};

export function PrimaryLink({ children, className, ...linkProps }: Props) {
  const ref = useRef<HTMLAnchorElement | null>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rx = e.clientX - rect.left;
    const ry = e.clientY - rect.top;
    el.style.setProperty("--rx", `${rx}px`);
    el.style.setProperty("--ry", `${ry}px`);
    // Re-trigger animation by toggling the attribute off and back on.
    el.removeAttribute("data-ripple");
    void el.offsetWidth; // force reflow
    el.setAttribute("data-ripple", "1");
  }, []);

  const merged = ["btn-primary", className].filter(Boolean).join(" ");
  return (
    <Link
      {...linkProps}
      ref={ref}
      className={merged}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
