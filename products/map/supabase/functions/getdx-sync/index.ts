import { createSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const apiToken = Deno.env.get("GETDX_API_TOKEN")!;
  const baseUrl = Deno.env.get("GETDX_BASE_URL") || "https://api.getdx.com";
  const timestamp = new Date().toISOString();
  const results = { files: [] as string[], errors: [] as string[] };

  // Extract: fetch and store raw API responses
  try {
    // teams.list
    const teamsResponse = await fetchGetDX("/teams.list", apiToken, baseUrl);
    await storeRaw(
      supabase,
      `getdx/teams-list/${timestamp}.json`,
      teamsResponse,
    );
    results.files.push(`getdx/teams-list/${timestamp}.json`);

    // snapshots.list
    const snapshotsResponse = await fetchGetDX(
      "/snapshots.list",
      apiToken,
      baseUrl,
    );
    await storeRaw(
      supabase,
      `getdx/snapshots-list/${timestamp}.json`,
      snapshotsResponse,
    );
    results.files.push(`getdx/snapshots-list/${timestamp}.json`);

    // snapshots.info for each snapshot
    for (const snapshot of snapshotsResponse.snapshots || []) {
      if (snapshot.deleted_at) continue;
      const infoResponse = await fetchGetDX(
        `/snapshots.info?snapshot_id=${encodeURIComponent(snapshot.id)}`,
        apiToken,
        baseUrl,
      );
      await storeRaw(
        supabase,
        `getdx/snapshots-info/${snapshot.id}.json`,
        infoResponse,
      );
      results.files.push(`getdx/snapshots-info/${snapshot.id}.json`);
    }
  } catch (err) {
    results.errors.push((err as Error).message);
  }

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});

async function fetchGetDX(endpoint: string, token: string, baseUrl: string) {
  const url = new URL(endpoint, baseUrl);
  const response = await fetch(url.href, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `GetDX ${endpoint}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

async function storeRaw(
  supabase: ReturnType<typeof createSupabaseClient>,
  path: string,
  data: unknown,
) {
  const { error } = await supabase.storage
    .from("raw")
    .upload(path, JSON.stringify(data), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`storeRaw(${path}): ${error.message}`);
}
