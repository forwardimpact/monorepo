import { assertProvenance } from "../provenance.js";
import { readRaw } from "../storage.js";

const PLACEHOLDER_PROVENANCE = "synthetic_placeholder";

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{inserted: number, skipped: number, errors: Array<string>}>}
 */
export async function transformEvidence(supabase) {
  let raw;
  try {
    raw = await readRaw(supabase, "getdx/evidence.json");
  } catch {
    return { inserted: 0, skipped: 0, errors: [] };
  }

  const { evidence } = JSON.parse(raw);

  const { error: deleteError } = await supabase
    .from("evidence")
    .delete()
    .eq("provenance", "synthetic_placeholder");
  if (deleteError) {
    return { inserted: 0, skipped: 0, errors: [deleteError.message] };
  }

  if (!evidence || evidence.length === 0) {
    return { inserted: 0, skipped: 0, errors: [] };
  }

  const { data: artifacts } = await supabase
    .from("github_artifacts")
    .select("artifact_id, email, artifact_type, metadata")
    .not("email", "is", null);

  const byEmail = new Map();
  for (const a of artifacts || []) {
    if (!byEmail.has(a.email)) byEmail.set(a.email, []);
    byEmail.get(a.email).push(a);
  }

  const { rows, skipped } = buildRows(evidence, byEmail);

  const errors = [];
  if (rows.length > 0) {
    const { error } = await supabase.from("evidence").upsert(rows, {
      onConflict: "artifact_id,skill_id,level_id,marker_text",
      ignoreDuplicates: true,
    });
    if (error) {
      errors.push(error.message);
      return { inserted: 0, skipped, errors };
    }
  }

  return { inserted: rows.length, skipped, errors };
}

function buildRows(evidence, byEmail) {
  assertProvenance(PLACEHOLDER_PROVENANCE);
  const indexByEmail = new Map();
  let skipped = 0;
  const rows = [];

  for (const ev of evidence) {
    const personArtifacts = byEmail.get(ev.person_email);
    if (!personArtifacts || personArtifacts.length === 0) {
      skipped++;
      continue;
    }

    const idx = indexByEmail.get(ev.person_email) || 0;
    const artifact = personArtifacts[idx % personArtifacts.length];
    indexByEmail.set(ev.person_email, idx + 1);

    const markerText =
      artifact.metadata?.title ||
      artifact.metadata?.message ||
      `${ev.skill_id} evidence`;

    rows.push({
      artifact_id: artifact.artifact_id,
      skill_id: ev.skill_id,
      level_id: ev.proficiency,
      marker_text: markerText,
      matched: true,
      rationale:
        "Round-robin placeholder from getdx/evidence.json — not derived from artifact content.",
      provenance: PLACEHOLDER_PROVENANCE,
      created_at: ev.observed_at,
    });
  }

  return { rows, skipped };
}
