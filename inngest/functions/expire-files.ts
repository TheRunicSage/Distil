// Daily 02:00 NZT (14:00 UTC). Delete generated DOCX files for
// applications past their 60-day file expiry. Sets files_deleted_at on
// success. Skips is_demo=true rows. Storage delete first, then DB
// update — if storage fails we leave files_deleted_at null and the next
// run retries.

import "server-only";
import { withCronLog } from "@/lib/logging/with-inngest-step";
import { createServiceClient } from "@/lib/supabase/service";
import { inngest } from "../client";

const BUCKET = "generated";

export const expireFiles = inngest.createFunction(
  {
    id: "expire-files",
    name: "Expire Files (60d)",
    triggers: [{ cron: "0 14 * * *" }],
  },
  async () => {
    return withCronLog("expire-files", async () => {
      const supabase = createServiceClient();
      const nowIso = new Date().toISOString();

      const { data: rows, error } = await supabase
        .from("applications")
        .select("id, user_id, cv_storage_path, letter_storage_path")
        .lte("files_expire_at", nowIso)
        .is("files_deleted_at", null)
        .eq("status", "success")
        .eq("is_demo", false)
        .limit(500);
      if (error) throw error;
      if (!rows || rows.length === 0) return { deleted: 0 };

      let deleted = 0;
      for (const row of rows) {
        const paths: string[] = [];
        if (row.cv_storage_path) paths.push(row.cv_storage_path);
        if (row.letter_storage_path) paths.push(row.letter_storage_path);
        if (paths.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from(BUCKET)
            .remove(paths);
          if (storageErr) continue; // retry next run
        }
        const { error: updateErr } = await supabase
          .from("applications")
          .update({ files_deleted_at: nowIso })
          .eq("id", row.id);
        if (!updateErr) deleted += 1;
      }
      return { deleted };
    });
  },
);
