import { createSupabaseClient } from "../_shared/supabase.ts";
import { extractPeopleFile } from "../_shared/activity/extract/people.js";
import { transformPeople } from "../_shared/activity/transform/people.js";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("Content-Type") || "";
  const isCSV = contentType.includes("text/csv");
  const format = isCSV ? "csv" : "yaml";
  const body = await req.text();

  const supabase = createSupabaseClient();

  const extractResult = await extractPeopleFile(supabase, body, format);
  if (!extractResult.stored) {
    return json({ ok: false, stored: false, error: extractResult.error }, 500);
  }

  const { imported, errors } = await transformPeople(supabase);

  return json({
    ok: errors.length === 0,
    stored: true,
    path: extractResult.path,
    imported,
    errors,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
