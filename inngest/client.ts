// Inngest client. Single instance shared by every function.
//
// Inngest v4 dropped EventSchemas/fromRecord. Strong event typing is no
// longer attached to the client; we keep the canonical event taxonomy
// here as a TypeScript type and use it explicitly when sending events
// or reading event.data inside handlers.
//
// Naming convention: 'application/<noun>.<verb>' per Inngest house style.
//
// Dev vs. prod: `isDev` is set deterministically from NODE_ENV. In dev
// the SDK targets the local Inngest dev server (default
// http://localhost:8288) and does NOT require an event key. In prod it
// targets Inngest Cloud and requires INNGEST_EVENT_KEY +
// INNGEST_SIGNING_KEY (validated by lib/env.ts).

import { Inngest } from "inngest";

const isDev = process.env.NODE_ENV !== "production";

export type ApplicationGenerateRequested = {
  name: "application/generate.requested";
  data: {
    application_id: string;
    user_id: string;
  };
};

export type ApplicationGenerationCompleted = {
  name: "application/generation.completed";
  data: {
    application_id: string;
    user_id: string;
    outcome:
      | "success"
      | "insufficient_input"
      | "error"
      | "abandoned"
      | "cancelled";
  };
};

export type DistilEvent =
  | ApplicationGenerateRequested
  | ApplicationGenerationCompleted;

export const inngest = new Inngest({
  id: "distil",
  isDev,
  ...(isDev ? {} : { eventKey: process.env.INNGEST_EVENT_KEY }),
});
