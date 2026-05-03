// DOCX text extraction via mammoth. Same minimum-text guarantee as the PDF
// path so downstream code can treat the parsed text uniformly. Mammoth has
// no native dependencies; serverless-safe out of the box.

import "server-only";

import mammoth from "mammoth";

import { ApiError } from "@/lib/errors/api-error";
import { sanitiseExtractedText } from "./sanitise-text";

const MIN_CHARS = 200;

export async function parseDocx(
  buffer: ArrayBuffer | Buffer,
): Promise<string> {
  const nodeBuffer =
    buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;

  let text: string;
  try {
    const result = await mammoth.extractRawText({ buffer: nodeBuffer });
    // Sanitise for symmetry with the PDF path; mammoth output is
    // generally clean, but applying the same NUL/control-byte strip
    // means downstream code doesn't need to care which parser ran.
    text = sanitiseExtractedText(result.value ?? "").trim();
  } catch (err) {
    throw new ApiError(
      "master_cv_parse_failed",
      err instanceof Error ? err.message : "DOCX parse failed",
    );
  }

  if (text.length < MIN_CHARS) {
    throw new ApiError("master_cv_parse_failed");
  }
  return text;
}
