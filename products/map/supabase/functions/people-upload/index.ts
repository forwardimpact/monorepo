import { createSupabaseClient } from "../_shared/supabase.ts";
import { createHostedRuntime } from "../_shared/runtime.ts";
import { handlePeopleUpload } from "./handler.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("Content-Type") || "";
  const isCSV = contentType.includes("text/csv");
  const format = isCSV ? "csv" : "yaml";
  const body = await req.text();

  const result = await handlePeopleUpload(
    createSupabaseClient(),
    createHostedRuntime(),
    body,
    format,
  );

  return json(result, result.stored ? 200 : 500);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
