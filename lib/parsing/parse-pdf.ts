// PDF text extraction via unpdf (serverless-safe, zero native deps).
// 5-second hard timeout via Promise.race (Decision Log [7] Option A).
// Throws ApiError('master_cv_parse_failed') if extraction fails or yields
// fewer than 200 characters of usable text.

import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { ApiError } from "@/lib/errors/api-error";

const TIMEOUT_MS = 5_000;
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

  const text = (result.text ?? "").trim();
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
