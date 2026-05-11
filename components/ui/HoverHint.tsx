// Small CSS-only hover/focus popover. Wraps a trigger with a
// `.group` parent; the hint sits in normal flow but is invisible
// until the parent is hovered or one of its descendants takes focus
// (keyboard a11y). Mirrors the MissingFieldsBadge pattern — no JS,
// no portal — appropriate for short explanatory blurbs that sit
// inside non-backdrop-blurred containers. If you need a hint inside
// a surface-card or anywhere a parent creates a backdrop-blur
// stacking context, use a portal-based primitive instead.
//
// Positioning defaults to "bottom-start" (under the trigger,
// left-aligned). Width is fixed at w-72 (288px) with a viewport-edge
// clamp via max-w so narrow screens don't bleed off.

import type { ReactNode } from "react";

type Props = {
  // Visual trigger. Caller styles it however — pill, button, etc.
  // The hint reads its hover/focus state from the .group wrapper, so
  // the trigger doesn't need any group-* classes itself.
  trigger: ReactNode;
  // Hint title (the same as the trigger label is fine — anchors the
  // popover content). Optional; omit for purely-explanatory hints.
  title?: string;
  // Hint body. Plain text or a small fragment.
  children: ReactNode;
};

export function HoverHint({ trigger, title, children }: Props) {
  return (
    <span className="group relative inline-block">
      {/* tabindex=0 on the wrapper lets keyboard users focus the
          chip to reveal the hint. Triggers that are themselves
          buttons or links already focusable carry their own
          focus-visible handling — this is the fallback for pill
          spans that aren't focusable by default. */}
      <span tabIndex={0} className="outline-none">
        {trigger}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] translate-y-1 rounded-xl border border-border bg-dark4 p-3 text-left text-xs leading-relaxed text-text opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-150 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {title && (
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </span>
        )}
        <span className={title ? "mt-1.5 block text-text/90" : "block text-text/90"}>
          {children}
        </span>
      </span>
    </span>
  );
}
