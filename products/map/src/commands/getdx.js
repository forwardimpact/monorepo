import { extractGetDX } from "@forwardimpact/map/activity/extract/getdx";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import {
  formatHeader,
  formatBullet,
  formatError,
  formatSuccess,
} from "@forwardimpact/libcli";

/** Fetch GetDX teams, snapshots, and scores from the API and transform them into the activity database. */
export async function sync(supabase, { baseUrl, runtime } = {}) {
  const apiToken = runtime.proc.env.GETDX_API_TOKEN;
  if (!apiToken) {
    runtime.proc.stderr.write(
      formatError(
        "GETDX_API_TOKEN is not set. Export it before running getdx sync.",
      ) + "\n",
    );
    return 1;
  }

  runtime.proc.stdout.write(formatHeader("Extracting GetDX snapshots") + "\n");
  const extract = await extractGetDX(
    supabase,
    { apiToken, baseUrl: baseUrl ?? "https://api.getdx.com" },
    runtime,
  );
  runtime.proc.stdout.write(
    formatBullet(`Stored ${extract.files.length} raw files`, 0) + "\n",
  );
  if (extract.errors.length > 0) {
    runtime.proc.stderr.write(formatError("Extract errors:") + "\n");
    for (const err of extract.errors) {
      runtime.proc.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }

  runtime.proc.stdout.write(
    "\n" + formatHeader("Transforming GetDX data") + "\n",
  );
  const result = await transformAllGetDX(supabase, runtime);
  runtime.proc.stdout.write(
    formatSuccess(
      `Imported ${result.teams} teams, ${result.snapshots} snapshots, ${result.scores} scores`,
    ) + "\n",
  );
  if (result.errors.length > 0) {
    runtime.proc.stderr.write(formatError("Transform errors:") + "\n");
    for (const err of result.errors) {
      runtime.proc.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }
  return 0;
}
