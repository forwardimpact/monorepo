import { extractGetDX } from "@forwardimpact/map/activity/extract/getdx";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";

export async function sync(supabase, { baseUrl } = {}) {
  const apiToken = process.env.GETDX_API_TOKEN;
  if (!apiToken) {
    console.error(
      "GETDX_API_TOKEN is not set. Export it before running getdx sync.",
    );
    return 1;
  }

  console.log("Extracting GetDX snapshots...");
  const extract = await extractGetDX(supabase, {
    apiToken,
    baseUrl: baseUrl ?? "https://api.getdx.com",
  });
  console.log(`  Stored ${extract.files.length} raw files`);
  if (extract.errors.length > 0) {
    console.error("Extract errors:");
    for (const err of extract.errors) console.error(`  - ${err}`);
    return 1;
  }

  console.log("\nTransforming GetDX data...");
  const result = await transformAllGetDX(supabase);
  console.log(
    `Imported ${result.teams} teams, ${result.snapshots} snapshots, ${result.scores} scores`,
  );
  if (result.errors.length > 0) {
    console.error("Transform errors:");
    for (const err of result.errors) console.error(`  - ${err}`);
    return 1;
  }
  return 0;
}
