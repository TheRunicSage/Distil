"use client";

// Paginated viewport for the CV / cover letter previews. The inner
// CvPreview / CoverLetterPreview article is rendered at true A4
// dimensions (794×1123 px = 210×297mm at 96 DPI) and transform-
// scaled down to fit the column width. This makes the preview's
// page breaks align with the DOCX's actual page boundaries: the
// content's offsetTop / offsetHeight values are read in unscaled
// (true A4) coordinate space, and the page-height threshold is
// the unscaled A4 height of 1123 px.
//
// Page breaks land on natural section boundaries: every element
// with `data-page-section` is treated as an indivisible block. The
// packer walks them in DOM order and starts a new page whenever
// the next block would exceed the current page's bottom edge. A
// block bigger than one page (rare — would require a single role
// with 20 long bullets) stays put rather than getting split mid-
// content; the frame clips visually but the user can still see
// the rest by paging.
//
// Cover letters are typically one page, in which case the controls
// auto-hide and the component degrades to a fixed-height card with
// no chrome change.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

// True A4 at 96 DPI in CSS pixels. 210mm × 96 / 25.4 = 793.7;
// 297mm × 96 / 25.4 = 1122.5. Rounded for use in layout math.
const A4_PAGE_WIDTH_PX = 794;
const A4_PAGE_HEIGHT_PX = 1123;
const A4_RATIO = A4_PAGE_HEIGHT_PX / A4_PAGE_WIDTH_PX;
const PAGE_TRANSITION_MS = 280;

type Props = {
  children: React.ReactNode;
  ariaLabel?: string;
};

export function PagedPreview({ children, ariaLabel }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  const [currentPage, setCurrentPage] = useState(0);

  // Track frame width via ResizeObserver. Frame height = width *
  // A4_RATIO; content scale = frame width / A4_PAGE_WIDTH_PX.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setFrameWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Recompute page offsets whenever the frame size or rendered
  // content changes. Section offsets are read in DOM order; the
  // packer keeps adding sections to the current page until the
  // running bottom would exceed the page boundary, then starts a
  // new page anchored on the overflowing section's top.
  //
  // Important: offsetTop / offsetHeight are read in UNSCALED
  // coordinates (transforms don't affect layout offsets), so the
  // page-height threshold is A4_PAGE_HEIGHT_PX, not the visual
  // frame height. This is what aligns preview pagination with
  // DOCX page boundaries.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || frameWidth === 0) return;

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
      if (bottom - pageStart > A4_PAGE_HEIGHT_PX && top > pageStart) {
        pageStart = top;
        offsets.push(top);
      }
    }
    setPageOffsets(offsets);
    setCurrentPage((prev) => Math.min(prev, offsets.length - 1));
  }, [frameWidth, children]);

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
  const scale = frameWidth > 0 ? frameWidth / A4_PAGE_WIDTH_PX : 1;
  const frameHeight = frameWidth > 0 ? frameWidth * A4_RATIO : 0;

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
          scaled+translated article clipped to the page silhouette. */}
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-lg"
        style={{ height: frameHeight ? `${frameHeight}px` : undefined }}
      >
        {/* Inner container is fixed at A4 width (794px). The transform
            scales the entire article (including all text and spacing)
            to fit the variable column width. transform-origin: top
            left so paging via translateY in unscaled coords lands at
            the right visual position after scale is applied. */}
        <div
          ref={contentRef}
          className="absolute left-0 top-0"
          style={{
            width: `${A4_PAGE_WIDTH_PX}px`,
            transform: `translateY(-${translateY}px) scale(${scale})`,
            transformOrigin: "top left",
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
      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-[transform,box-shadow,background-color,border-color,color] duration-150 ${
        disabled
          ? "cursor-not-allowed border-border text-muted-foreground/40"
          : "border-orange/50 text-orange hover:bg-[var(--color-orange-subtle)] hover:shadow-[0_2px_8px_rgba(226,97,59,0.18)] motion-safe:active:scale-[0.92]"
      }`}
    >
      {children}
    </button>
  );
}
