import { createSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("Content-Type") || "";
  const isCSV = contentType.includes("text/csv");
  const ext = isCSV ? "csv" : "yaml";
  const body = await req.text();
  const timestamp = new Date().toISOString();

  const supabase = createSupabaseClient();

  // Extract: store raw file
  const path = `people/${timestamp}.${ext}`;
  const { error: storeError } = await supabase.storage
    .from("raw")
    .upload(path, body, {
      contentType: isCSV ? "text/csv" : "application/x-yaml",
      upsert: true,
    });

  if (storeError) {
    return new Response(JSON.stringify({ error: storeError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ stored: true, path }), {
    headers: { "Content-Type": "application/json" },
  });
});
