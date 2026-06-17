import { createSupabaseClient } from "../_shared/supabase.ts";
import { createHostedRuntime } from "../_shared/runtime.ts";
import { loadHostedMapData } from "../_shared/activity/map-data.js";
import { handleTransform } from "./handler.js";

Deno.serve(async (_req) => {
  const body = await handleTransform(
    createSupabaseClient(),
    createHostedRuntime(),
    () => loadHostedMapData((url: URL) => Deno.readTextFile(url)),
  );
  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
