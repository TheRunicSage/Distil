"use client";

// Full-viewport overlay that holds a zoomed copy of one preview.
// Triggered from PreviewPanel's zoom button. Native scroll inside
// the body; Esc + close button + backdrop click all dismiss.
// `overscroll-behavior: contain` on the scroll container keeps
// wheel events from chaining to the underlying (app) main.

import { useEffect } from "react";
import { XIcon } from "lucide-react";

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function PreviewZoomModal({ title, onClose, children }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-dark/95 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border/50 bg-dark/70 px-6 py-4 backdrop-blur-md">
        <p className="eyebrow">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="btn-icon"
        >
          <XIcon size={20} aria-hidden />
        </button>
      </header>
      <div
        className="flex-1 overflow-y-auto px-6 py-8"
        style={{ overscrollBehavior: "contain" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="mx-auto max-w-[900px]">{children}</div>
      </div>
    </div>
  );
}
