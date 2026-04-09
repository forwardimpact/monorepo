import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractGetDX } from "../_shared/activity/extract/getdx.js";
import { transformAllGetDX } from "../_shared/activity/transform/getdx.js";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const apiToken = Deno.env.get("GETDX_API_TOKEN");
  const baseUrl = Deno.env.get("GETDX_BASE_URL") || "https://api.getdx.com";

  if (!apiToken) {
    return json({ ok: false, error: "GETDX_API_TOKEN not set" }, 500);
  }

  const extract = await extractGetDX(supabase, { apiToken, baseUrl });
  const transform = await transformAllGetDX(supabase);

  return json({
    ok: extract.errors.length === 0 && transform.errors.length === 0,
    extract: { files: extract.files, errors: extract.errors },
    transform,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
