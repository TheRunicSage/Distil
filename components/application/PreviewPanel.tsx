"use client";

// One preview's surface card: eyebrow label on the left, zoom +
// download icon buttons on the right, scrollable preview body
// below. Click the zoom icon to open a full-viewport modal with
// the same preview content. Renders the children twice when the
// modal is open (once in the card, once in the modal); both
// previews are stateless server-render-friendly so the duplication
// is cheap.

import { useState } from "react";
import { DownloadIcon, Maximize2Icon } from "lucide-react";
import { PreviewZoomModal } from "./PreviewZoomModal";

type Props = {
  eyebrow: string;
  downloadHref: string;
  downloadLabel: string;
  zoomLabel: string;
  scrollMaxHeight?: string; // tailwind class, e.g. "max-h-[900px]"
  children: React.ReactNode;
};

export function PreviewPanel({
  eyebrow,
  downloadHref,
  downloadLabel,
  zoomLabel,
  scrollMaxHeight = "max-h-[900px]",
  children,
}: Props) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <>
      <div className="surface-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="eyebrow">{eyebrow}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label={zoomLabel}
              title={zoomLabel}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-orange/40 bg-dark2/60 text-orange transition-colors hover:border-orange hover:bg-orange/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40"
            >
              <Maximize2Icon size={18} aria-hidden />
            </button>
            <a
              href={downloadHref}
              aria-label={downloadLabel}
              title={downloadLabel}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange/40"
            >
              <DownloadIcon size={18} aria-hidden />
            </a>
          </div>
        </div>
        <div
          className={`overflow-y-auto rounded-lg ${scrollMaxHeight}`}
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
      {zoomOpen && (
        <PreviewZoomModal title={eyebrow} onClose={() => setZoomOpen(false)}>
          {children}
        </PreviewZoomModal>
      )}
    </>
  );
}
