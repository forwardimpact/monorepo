import { deriveSkillMatrix } from "@forwardimpact/libskill";
import { assertProvenance } from "../provenance.js";

const ARTIFACT_PROVENANCE = "artifact_interpreted";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "under",
  "have",
  "been",
  "were",
  "will",
  "would",
  "could",
  "should",
  "your",
  "their",
  "about",
  "after",
  "before",
  "while",
  "because",
  "when",
  "where",
  "what",
]);

/** Lowercase the text. Split on whitespace. Strip token-edge punctuation. */
function tokenise(text) {
  return (text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
}

/**
 * Tokenise the marker text on whitespace. Lowercase each token. Remove the
 * stop-words. Drop tokens shorter than 4 characters.
 * @param {string} markerText
 * @returns {Set<string>}
 */
export function tokeniseMarker(markerText) {
  return new Set(
    tokenise(markerText).filter((t) => t.length >= 4 && !STOP_WORDS.has(t)),
  );
}

/**
 * Build the text surface for an artifact: title + body for PRs, body for
 * reviews, message for commits.
 * @param {{artifact_type: string, metadata: object}} artifact
 * @returns {Set<string>}
 */
export function tokeniseArtifact(artifact) {
  const m = artifact.metadata ?? {};
  let surface;
  if (artifact.artifact_type === "pull_request") {
    surface = `${m.title ?? ""} ${m.body ?? ""}`;
  } else if (artifact.artifact_type === "review") {
    surface = m.body ?? "";
  } else {
    surface = m.message ?? "";
  }
  return new Set(tokenise(surface));
}

/**
 * Count the distinct marker keywords that appear in the artifact's text
 * surface. Return the matched keywords.
 * @param {string} markerText
 * @param {Set<string>} artifactTokens
 * @returns {{score: number, matchedKeywords: string[]}}
 */
export function scoreMarkerAgainstArtifact(markerText, artifactTokens) {
  const matchedKeywords = [...tokeniseMarker(markerText)]
    .filter((kw) => artifactTokens.has(kw))
    .sort();
  return { score: matchedKeywords.length, matchedKeywords };
}

/**
 * Rule 3 selection. Pick the highest token-overlap score. On a tie or on
 * zero overlap, pick the lexicographically earliest marker text. On a
 * further tie, pick the chronologically earliest artifact.
 * @param {Array<{artifact: object, marker: string, score: number}>} pairs
 * @returns {{artifact: object, marker: string, score: number}}
 */
export function pickFloorRow(pairs) {
  return pairs.reduce((best, p) => {
    if (!best) return p;
    if (p.score !== best.score) return p.score > best.score ? p : best;
    if (p.marker !== best.marker) return p.marker < best.marker ? p : best;
    return p.artifact.occurred_at < best.artifact.occurred_at ? p : best;
  }, null);
}

function resolveProfileObjects(personRow, mapData) {
  const discipline = (mapData.disciplines ?? []).find(
    (d) => d.id === personRow.discipline,
  );
  const level = (mapData.levels ?? []).find((l) => l.id === personRow.level);
  const track = personRow.track
    ? (mapData.tracks ?? []).find((t) => t.id === personRow.track)
    : null;
  if (!discipline || !level) return null;
  return { discipline, level, track };
}

/** Flatten a skill's human + agent markers at a proficiency to one ordered list. */
function markersForEntry(entry, mapData) {
  const skill = (mapData.skills ?? []).find((s) => s.id === entry.skillId);
  const markers = skill?.markers?.[entry.proficiency];
  if (!markers) return [];
  return [...(markers.human ?? []), ...(markers.agent ?? [])];
}

function toRow(pair, entry, rationale) {
  return {
    artifact_id: pair.artifact.artifact_id,
    skill_id: entry.skillId,
    level_id: entry.proficiency,
    marker_text: pair.marker,
    matched: true,
    rationale,
    provenance: ARTIFACT_PROVENANCE,
    created_at: pair.artifact.occurred_at,
  };
}

/** Score every (artifact, marker) pair for one repository's artifacts. */
function scoreAllPairs(artifacts, markerList) {
  const pairs = [];
  for (const artifact of artifacts) {
    const artifactTokens = tokeniseArtifact(artifact);
    for (const marker of markerList) {
      const { score, matchedKeywords } = scoreMarkerAgainstArtifact(
        marker,
        artifactTokens,
      );
      pairs.push({ artifact, marker, score, matchedKeywords });
    }
  }
  return pairs;
}

/**
 * Rule 2. Emit one row for each (artifact_id, skill_id). The best marker
 * wins. Break a tie lexicographically.
 */
function pickBestPerArtifact(hits) {
  const byArtifact = new Map();
  for (const p of hits) {
    const cur = byArtifact.get(p.artifact.artifact_id);
    if (
      !cur ||
      p.score > cur.score ||
      (p.score === cur.score && p.marker < cur.marker)
    ) {
      byArtifact.set(p.artifact.artifact_id, p);
    }
  }
  return [...byArtifact.values()];
}

/**
 * Emit rows for one persona's artifacts against one matrix entry. Apply
 * the three bounded-heuristic rules for each repository.
 */
function emitForSkill(entry, markerList, byRepo) {
  const rows = [];
  for (const [repository, artifacts] of byRepo) {
    const pairs = scoreAllPairs(artifacts, markerList);
    const hits = pairs.filter((p) => p.score >= 2);
    if (hits.length > 0) {
      for (const p of pickBestPerArtifact(hits)) {
        rows.push(
          toRow(
            p,
            entry,
            `Token-overlap score ${p.score}. ${p.matchedKeywords.length} keywords matched: ${p.matchedKeywords.join(", ")}.`,
          ),
        );
      }
    } else if (pairs.length > 0) {
      // Rule 3. The per-(repo, skill) floor fires unconditionally.
      const p = pickFloorRow(pairs);
      rows.push(
        toRow(
          p,
          entry,
          `Structural floor: persona has artifacts in ${repository} but no marker scored ≥2 keywords against this skill. This row satisfies the per-repo, per-skill floor.`,
        ),
      );
    }
  }
  return rows;
}

/** Group joined artifact rows by email. Count profile-less rows as skipped. */
function groupByPersona(data) {
  let skipped = 0;
  const byEmail = new Map();
  for (const row of data ?? []) {
    if (!row.organization_people) {
      skipped++;
      continue;
    }
    if (!byEmail.has(row.email)) byEmail.set(row.email, []);
    byEmail.get(row.email).push(row);
  }
  return { byEmail, skipped };
}

/** Derive one persona's matrix (cached per profile triple) and emit its rows. */
function buildPersonaRows(personaRows, mapData, matrixCache) {
  const person = personaRows[0].organization_people;
  const profile = resolveProfileObjects(person, mapData);
  if (!profile) return null;

  const cacheKey = `${person.discipline}\t${person.level}\t${person.track ?? ""}`;
  let matrix = matrixCache.get(cacheKey);
  if (!matrix) {
    matrix = deriveSkillMatrix({
      ...profile,
      skills: mapData.skills,
      capabilities: mapData.capabilities,
    });
    matrixCache.set(cacheKey, matrix);
  }

  const byRepo = new Map();
  for (const a of personaRows) {
    if (!byRepo.has(a.repository)) byRepo.set(a.repository, []);
    byRepo.get(a.repository).push(a);
  }

  const rows = [];
  for (const entry of matrix) {
    const markerList = markersForEntry(entry, mapData);
    if (markerList.length === 0) continue;
    rows.push(...emitForSkill(entry, markerList, byRepo));
  }
  return rows;
}

/**
 * Artifact-driven evidence producer. Reads github_artifacts joined to
 * organization_people. Derives each persona's skill matrix from pathway
 * data. Applies the bounded match heuristic (two-keyword overlap floor,
 * one row per artifact+skill, unconditional per-repo-per-skill emit
 * floor). Writes rows tagged provenance=artifact_interpreted with a
 * per-class delete + ON CONFLICT DO NOTHING upsert.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{mapData: object}} collaborators - Standard data from loadAllData.
 * @returns {Promise<{inserted: number, skipped: number, errors: Array<string>}>}
 */
export async function transformEvidenceArtifact(supabase, { mapData }) {
  assertProvenance(ARTIFACT_PROVENANCE);

  const { data, error } = await supabase
    .from("github_artifacts")
    .select(
      `
      artifact_id, email, repository, artifact_type, metadata, occurred_at,
      organization_people(discipline, level, track)
    `,
    )
    .not("email", "is", null);
  if (error) {
    return { inserted: 0, skipped: 0, errors: [error.message] };
  }

  const { byEmail, skipped: noProfile } = groupByPersona(data);
  let skipped = noProfile;

  const matrixCache = new Map();
  const rows = [];
  for (const personaRows of byEmail.values()) {
    const personaResult = buildPersonaRows(personaRows, mapData, matrixCache);
    if (personaResult === null) {
      skipped += personaRows.length;
      continue;
    }
    rows.push(...personaResult);
  }

  rows.sort(
    (a, b) =>
      a.artifact_id.localeCompare(b.artifact_id) ||
      a.skill_id.localeCompare(b.skill_id) ||
      a.level_id.localeCompare(b.level_id) ||
      a.marker_text.localeCompare(b.marker_text),
  );

  const { error: deleteError } = await supabase
    .from("evidence")
    .delete()
    .eq("provenance", ARTIFACT_PROVENANCE);
  if (deleteError) {
    return { inserted: 0, skipped, errors: [deleteError.message] };
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("evidence")
      .upsert(rows, {
        onConflict: "artifact_id,skill_id,level_id,marker_text",
        ignoreDuplicates: true,
      });
    if (upsertError) {
      return { inserted: 0, skipped, errors: [upsertError.message] };
    }
  }

  return { inserted: rows.length, skipped, errors: [] };
}
