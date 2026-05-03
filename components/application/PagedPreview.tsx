"use client";

// Paginated viewport for the CV / cover letter previews. Wraps the
// existing CvPreview / CoverLetterPreview articles in an A4-aspect
// clipping frame and renders one page at a time, with brand-orange
// page-control chevrons + numerals when there's more than one page.
//
// Page breaks land on natural section boundaries: every element with
// `data-page-section` is treated as an indivisible block. The packer
// walks them in DOM order and starts a new page whenever the next
// block would exceed the current page's bottom edge. A block bigger
// than one page (rare — would require a single role with 20 long
// bullets) stays put rather than getting split mid-content; the
// frame clips visually but the user can scroll inside the frame
// natively if the section overflows.
//
// Cover letters are typically one page, in which case the controls
// auto-hide and the component degrades to a fixed-height card with
// no chrome change.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

const A4_RATIO = 297 / 210; // height / width
const PAGE_TRANSITION_MS = 280;

type Props = {
  children: React.ReactNode;
  ariaLabel?: string;
};

export function PagedPreview({ children, ariaLabel }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const [currentPage, setCurrentPage] = useState(0);

  // Track frame width via ResizeObserver and derive A4-ratio height.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setFrameHeight(width * A4_RATIO);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Recompute page offsets whenever the frame size or rendered
  // content changes. Section offsets are read in DOM order; the
  // packer keeps adding sections to the current page until the
  // running bottom would exceed the page boundary, then starts a
  // new page anchored on the overflowing section's top.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || frameHeight === 0) return;

    const sections = Array.from(
      content.querySelectorAll<HTMLElement>("[data-page-section]"),
    );
    if (sections.length === 0) {
      setPageOffsets([0]);
      return;
    }

    const offsets: number[] = [0];
    let pageStart = 0;
    for (const section of sections) {
      const top = section.offsetTop;
      const bottom = top + section.offsetHeight;
      if (bottom - pageStart > frameHeight && top > pageStart) {
        pageStart = top;
        offsets.push(top);
      }
    }
    setPageOffsets(offsets);
    setCurrentPage((prev) => Math.min(prev, offsets.length - 1));
  }, [frameHeight, children]);

  // Arrow-key paging only fires when the frame is in the viewport so
  // two PagedPreview siblings (CV + cover letter side by side) don't
  // both grab the keypress.
  const [hasFocusContext, setHasFocusContext] = useState(false);
  useEffect(() => {
    if (!hasFocusContext) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        setCurrentPage((p) => Math.max(0, p - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentPage((p) => Math.min(pageOffsets.length - 1, p + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasFocusContext, pageOffsets.length]);

  const totalPages = pageOffsets.length;
  const showControls = totalPages > 1;
  const atFirst = currentPage === 0;
  const atLast = currentPage === totalPages - 1;
  const translateY = pageOffsets[currentPage] ?? 0;

  return (
    <div
      className="flex flex-col gap-3"
      onMouseEnter={() => setHasFocusContext(true)}
      onMouseLeave={() => setHasFocusContext(false)}
      aria-label={ariaLabel}
    >
      {/* Frame is a pure clipping container — the inner CvPreview /
          CoverLetterPreview article supplies the paper styling (bg,
          border, shadow). Doubling it up would render as paper-on-
          paper. The overflow-hidden + rounded-lg here keeps the
          translated article clipped to the page silhouette. */}
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-lg"
        style={{ height: frameHeight ? `${frameHeight}px` : undefined }}
      >
        <div
          ref={contentRef}
          className="absolute inset-x-0 top-0"
          style={{
            transform: `translateY(-${translateY}px)`,
            transition: `transform ${PAGE_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0.24, 1)`,
          }}
        >
          {children}
        </div>
      </div>
      {showControls && (
        <div className="flex items-center justify-center gap-3">
          <PageButton
            label="Previous page"
            disabled={atFirst}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </PageButton>
          <span
            className="select-none font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
            aria-live="polite"
          >
            <span className="text-orange">{currentPage + 1}</span>
            <span className="mx-1.5 text-dim">/</span>
            <span>{totalPages}</span>
          </span>
          <PageButton
            label="Next page"
            disabled={atLast}
            onClick={() =>
              setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
            }
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
        disabled
          ? "cursor-not-allowed border-border text-muted-foreground/40"
          : "border-orange/50 text-orange hover:bg-[var(--color-orange-subtle)]"
      }`}
    >
      {children}
    </button>
  );
}
