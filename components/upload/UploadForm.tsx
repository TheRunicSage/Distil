"use client";

// Master CV upload form. Drag-and-drop zone with file preview, error
// surfaces, and toast confirmation on success. Submits multipart to
// /api/master-cv and routes back to dashboard on 201.

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useToast } from "@/components/ui/toast";

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = ".pdf,.docx";

function fileLabel(name: string): string {
  return name.length > 40 ? `${name.slice(0, 37)}…` : name;
}

export function UploadForm() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function setIfValid(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Files must be 3 MB or smaller.");
      setFile(null);
      return;
    }
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
      setError("Only PDF or DOCX files.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    setIfValid(e.target.files?.[0] ?? null);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    setIfValid(e.dataTransfer.files?.[0] ?? null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || pending) return;
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/master-cv", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Upload failed. Try again.";
        setError(msg);
        toast.push(msg, "error");
        setPending(false);
        return;
      }
      toast.push("Master CV uploaded.", "success");
      router.push("/dashboard");
      router.refresh();
    } catch {
      const msg = "Network error. Try again.";
      setError(msg);
      toast.push(msg, "error");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-orange bg-orange-dim"
            : file
              ? "border-success/50 bg-dark3"
              : "border-border bg-dark2 hover:border-orange/50 hover:bg-dark3"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={pickFile}
          className="sr-only"
        />
        {file ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-success">
              Ready
            </p>
            <p className="mt-2 font-mono text-sm text-text">
              {fileLabel(file.name)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {Math.round(file.size / 1024)} KB ·{" "}
              {file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "DOCX"}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="mt-3 text-[11px] text-muted-foreground hover:text-text"
            >
              Choose a different file
            </button>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
              Drop file here
            </p>
            <p className="mt-2 text-sm text-text">
              or{" "}
              <span className="text-orange underline-offset-2 hover:underline">
                browse
              </span>{" "}
              from your computer
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              PDF or DOCX, 3 MB max. Scanned PDFs without text won&apos;t
              parse — upload a text-based version or DOCX.
            </p>
          </>
        )}
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || pending}
        className="w-full rounded-sm bg-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading…" : file ? "Upload master CV" : "Choose a file to upload"}
      </button>
    </form>
  );
}
