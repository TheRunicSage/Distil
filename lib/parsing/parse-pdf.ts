// PDF text extraction via unpdf (serverless-safe, zero native deps).
// 15-second hard timeout via Promise.race (Decision Log [7] Option A,
// bumped 2026-05-03 from 5s — Vercel cold-start + PDF.js init can
// eat several seconds before the parse even begins, and the previous
// 5s tripped on legitimate 3-page PDFs after a cold boot).
// Throws ApiError('master_cv_parse_failed') if extraction fails or
// yields fewer than 200 characters of usable text.
//
// 2026-05-03: extracted text is run through sanitiseExtractedText
// before return. PDF.js occasionally emits NUL bytes when extracting
// from PDFs with non-Unicode glyph mappings (Canva icon fonts are
// the common offender); Postgres rejects those on insert into TEXT
// or JSONB with "unsupported Unicode escape sequence", which
// surfaced as a database_error in the master-cv upload route.

import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { ApiError } from "@/lib/errors/api-error";
import { sanitiseExtractedText } from "./sanitise-text";

const TIMEOUT_MS = 15_000;
const MIN_CHARS = 200;

export async function parsePdf(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  let result: { text: string };
  try {
    result = await Promise.race([
      runExtract(bytes),
      timeout<{ text: string }>(TIMEOUT_MS),
    ]);
  } catch (err) {
    throw new ApiError(
      "master_cv_parse_failed",
      err instanceof Error ? err.message : "PDF parse failed",
    );
  }

  const text = sanitiseExtractedText(result.text ?? "").trim();
  if (text.length < MIN_CHARS) {
    throw new ApiError("master_cv_parse_failed");
  }
  return text;
}

async function runExtract(bytes: Uint8Array): Promise<{ text: string }> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text };
}

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`PDF parse timed out after ${ms}ms`)), ms),
  );
}
