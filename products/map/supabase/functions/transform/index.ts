import { createSupabaseClient } from "../_shared/supabase.ts";
import { transformAll } from "../_shared/activity/transform/index.js";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const result = await transformAll(supabase);
  const ok =
    result.people.errors.length === 0 &&
    result.getdx.errors.length === 0 &&
    result.github.errors.length === 0;
  return new Response(JSON.stringify({ ok, ...result }), {
    status: ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
