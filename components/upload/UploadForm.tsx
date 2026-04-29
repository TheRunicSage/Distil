"use client";

// Master CV upload form. Client Component because it streams a file
// via FormData with progress feedback. POST goes to /api/master-cv;
// the route validates size, MIME, parses, and writes the row + storage
// object. On 201 we redirect back to the dashboard.

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = ".pdf,.docx";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (f && f.size > MAX_BYTES) {
      setError("Files must be 3 MB or smaller.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
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
        setError(body?.error?.message ?? "Upload failed. Try again.");
        setPending(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange">
          Choose file
        </span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={pickFile}
          className="mt-2 block w-full text-sm text-text file:mr-4 file:rounded-sm file:border-0 file:bg-orange file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-orange-light"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        PDF or DOCX, 3 MB max. Scanned PDFs without text won&apos;t parse —
        upload a text-based version or DOCX.
      </p>

      {file && (
        <p className="text-sm text-text">
          Selected: <span className="font-mono">{file.name}</span> ·{" "}
          {Math.round(file.size / 1024)} KB
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || pending}
        className="rounded-sm bg-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
