import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractGitHubWebhook } from "../_shared/activity/extract/github.js";
import { transformGitHubWebhook } from "../_shared/activity/transform/github.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const deliveryId = req.headers.get("X-GitHub-Delivery");
  const eventType = req.headers.get("X-GitHub-Event");

  if (!deliveryId || !eventType) {
    return new Response("Missing required GitHub headers", { status: 400 });
  }

  const payload = await req.json();
  const supabase = createSupabaseClient();

  const extractResult = await extractGitHubWebhook(supabase, {
    deliveryId,
    eventType,
    payload,
  });

  if (!extractResult.stored) {
    return json({ ok: false, error: extractResult.error }, 500);
  }

  const result = await transformGitHubWebhook(supabase, extractResult.path);

  return json({
    ok: result.errors.length === 0,
    raw: extractResult.path,
    event: result.event,
    artifacts: result.artifacts,
    errors: result.errors,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
