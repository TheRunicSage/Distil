// Inngest client. Single instance shared by every function.
//
// Inngest v4 dropped EventSchemas/fromRecord. Strong event typing is no
// longer attached to the client; we keep the canonical event taxonomy
// here as a TypeScript type and use it explicitly when sending events
// or reading event.data inside handlers.
//
// Naming convention: 'application/<noun>.<verb>' per Inngest house style.

import { Inngest } from "inngest";

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

export const inngest = new Inngest({ id: "distil" });
