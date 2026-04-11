import { extractGetDX } from "@forwardimpact/map/activity/extract/getdx";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import {
  formatHeader,
  formatBullet,
  formatError,
  formatSuccess,
} from "@forwardimpact/libcli";

export async function sync(supabase, { baseUrl } = {}) {
  const apiToken = process.env.GETDX_API_TOKEN;
  if (!apiToken) {
    process.stderr.write(
      formatError(
        "GETDX_API_TOKEN is not set. Export it before running getdx sync.",
      ) + "\n",
    );
    return 1;
  }

  process.stdout.write(formatHeader("Extracting GetDX snapshots") + "\n");
  const extract = await extractGetDX(supabase, {
    apiToken,
    baseUrl: baseUrl ?? "https://api.getdx.com",
  });
  process.stdout.write(
    formatBullet(`Stored ${extract.files.length} raw files`, 0) + "\n",
  );
  if (extract.errors.length > 0) {
    process.stderr.write(formatError("Extract errors:") + "\n");
    for (const err of extract.errors) {
      process.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }

  process.stdout.write("\n" + formatHeader("Transforming GetDX data") + "\n");
  const result = await transformAllGetDX(supabase);
  process.stdout.write(
    formatSuccess(
      `Imported ${result.teams} teams, ${result.snapshots} snapshots, ${result.scores} scores`,
    ) + "\n",
  );
  if (result.errors.length > 0) {
    process.stderr.write(formatError("Transform errors:") + "\n");
    for (const err of result.errors) {
      process.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }
  return 0;
}
