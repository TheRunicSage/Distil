// Client-side telemetry. Buffers up to 10 events per 5-second window, then
// flushes via keepalive fetch to POST /api/telemetry. The pagehide event
// triggers a final flush. Per-tab session_id is generated lazily and lives
// in sessionStorage (Decision Log [7]).

"use client";

import type {
  TelemetryEventMap,
  TelemetryEventName,
} from "./events";

const MAX_BATCH = 10;
const FLUSH_INTERVAL_MS = 5_000;
const SESSION_STORAGE_KEY = "distil.telemetry.session_id";

type QueuedEvent = {
  name: TelemetryEventName;
  properties: Record<string, unknown>;
  session_id: string;
  timestamp: string;
};

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let pageHideBound = false;

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return "no-storage";
  }
}

function bindPageHideOnce() {
  if (pageHideBound || typeof window === "undefined") return;
  window.addEventListener("pagehide", () => flush(true));
  pageHideBound = true;
}

function scheduleFlush() {
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    void flush(false);
  }, FLUSH_INTERVAL_MS);
}

async function flush(viaPageHide: boolean): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: viaPageHide,
    });
  } catch {
    // Drop on failure — telemetry must never disrupt the UI.
  }
}

export function trackEvent<K extends TelemetryEventName>(
  name: K,
  properties: TelemetryEventMap[K],
): void {
  if (typeof window === "undefined") return;
  bindPageHideOnce();

  queue.push({
    name,
    properties: properties as unknown as Record<string, unknown>,
    session_id: getSessionId(),
    timestamp: new Date().toISOString(),
  });

  if (queue.length >= MAX_BATCH) {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    void flush(false);
    return;
  }

  scheduleFlush();
}
