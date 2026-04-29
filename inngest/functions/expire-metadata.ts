// Daily 02:15 NZT (14:15 UTC). Delete application rows past their
// 1-year metadata expiry, plus orphaned superseded master CVs and
// their storage objects. Skips is_demo=true rows.
//
// Orphan detection runs in JS rather than a DB function: we list all
// superseded master CVs and exclude any IDs still referenced from
// applications. The expected dataset is tiny for the internal demo
// and adding a DB function (or RPC) would require a fresh migration.

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const MASTER_CV_BUCKET = "master-cvs";

export const expireMetadata = inngest.createFunction(
  {
    id: "expire-metadata",
    name: "Expire Metadata (1y)",
    triggers: [{ cron: "15 14 * * *" }],
  },
  async () => {
    return withCronLog("expire-metadata", async () => {
      const supabase = createServiceClient();
      const nowIso = new Date().toISOString();

      // 1. Application rows past metadata expiry. on delete cascade
      // on generation_events handles its child rows automatically.
      const { data: appRows } = await supabase
        .from("applications")
        .select("id")
        .lte("metadata_expires_at", nowIso)
        .eq("is_demo", false)
        .limit(1000);

      let appsDeleted = 0;
      if (appRows && appRows.length > 0) {
        const ids = appRows.map((r) => r.id);
        const { error } = await supabase
          .from("applications")
          .delete()
          .in("id", ids);
        if (!error) appsDeleted = ids.length;
      }

      // 2. Orphaned superseded master CVs. A master CV is orphan-eligible
      // when (a) it has been superseded, AND (b) no application row still
      // references it via master_cv_id.
      const { data: superseded } = await supabase
        .from("master_cvs")
        .select("id, storage_path")
        .not("superseded_at", "is", null)
        .limit(1000);

      let cvsDeleted = 0;
      if (superseded && superseded.length > 0) {
        const supIds = superseded.map((r) => r.id);
        const { data: refs } = await supabase
          .from("applications")
          .select("master_cv_id")
          .in("master_cv_id", supIds);
        const referenced = new Set(
          (refs ?? []).map((r) => r.master_cv_id as string),
        );
        const orphans = superseded.filter((r) => !referenced.has(r.id));

        if (orphans.length > 0) {
          const orphanIds = orphans.map((r) => r.id);
          const orphanPaths = orphans
            .map((r) => r.storage_path)
            .filter((p): p is string => Boolean(p));

          if (orphanPaths.length > 0) {
            // Storage delete first; if it fails we leave the row in
            // place and try again on the next run.
            const { error: storageErr } = await supabase.storage
              .from(MASTER_CV_BUCKET)
              .remove(orphanPaths);
            if (storageErr) {
              return { appsDeleted, cvsDeleted: 0 };
            }
          }

          const { error: dbErr } = await supabase
            .from("master_cvs")
            .delete()
            .in("id", orphanIds);
          if (!dbErr) cvsDeleted = orphanIds.length;
        }
      }

      return { appsDeleted, cvsDeleted };
    });
  },
);
