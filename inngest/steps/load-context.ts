// Load-context: fetches the application row plus the snapshotted master
// CV's parsed_text. Throws ApiError('database_error') if either read
// fails or the application/master_cv has been deleted out from under us.

import "server-only";
import { ApiError } from "@/lib/errors/api-error";
import { createServiceClient } from "@/lib/supabase/service";

export type GenerationContext = {
  application_id: string;
  user_id: string;
  master_cv_id: string;
  master_cv_text: string;
  job_description: string;
  user_notes: string | null;
  region: string;
  attempt_number: number;
  system_prompt_version: string;
};

export async function loadContext(
  applicationId: string,
): Promise<GenerationContext> {
  const supabase = createServiceClient();
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, user_id, master_cv_id, job_description, user_notes, region, attempt_number, system_prompt_version",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr || !app) throw new ApiError("database_error");

  const { data: cv, error: cvErr } = await supabase
    .from("master_cvs")
    .select("id, parsed_text")
    .eq("id", app.master_cv_id)
    .maybeSingle();
  if (cvErr || !cv || !cv.parsed_text) throw new ApiError("database_error");

  return {
    application_id: app.id,
    user_id: app.user_id,
    master_cv_id: app.master_cv_id,
    master_cv_text: cv.parsed_text,
    job_description: app.job_description,
    user_notes: app.user_notes,
    region: app.region,
    attempt_number: app.attempt_number,
    system_prompt_version: app.system_prompt_version,
  };
}
