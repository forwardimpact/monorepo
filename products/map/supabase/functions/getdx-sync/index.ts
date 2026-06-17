import { createSupabaseClient } from "../_shared/supabase.ts";
import { createHostedRuntime } from "../_shared/runtime.ts";
import { handleGetDXSync } from "./handler.js";

Deno.serve(async (_req) => {
  const apiToken = Deno.env.get("GETDX_API_TOKEN");
  const baseUrl = Deno.env.get("GETDX_BASE_URL") || "https://api.getdx.com";

  if (!apiToken) {
    return json({ ok: false, error: "GETDX_API_TOKEN not set" }, 500);
  }

  const result = await handleGetDXSync(
    createSupabaseClient(),
    createHostedRuntime(),
    { apiToken, baseUrl },
  );

  return json(result, result.ok ? 200 : 500);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
