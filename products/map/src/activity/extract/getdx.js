/**
 * GetDX Extract
 *
 * Fetches from the GetDX REST API and stores the raw JSON responses in
 * Supabase Storage. Each API call produces one stored document.
 */

import { isoTimestamp } from "@forwardimpact/libutil";
import { storeRaw } from "../storage.js";

/**
 * @typedef {object} GetDXConfig
 * @property {string} apiToken - GetDX API token
 * @property {string} baseUrl - GetDX API base URL
 */

/**
 * Fetch a single endpoint, store its JSON, and record success/failure.
 * @param {object} ctx - { supabase, config, files, errors }
 * @param {string} endpoint - GetDX API endpoint
 * @param {string} storagePath - Supabase Storage path
 * @param {string} errorLabel - Label used in error messages
 * @returns {Promise<object|undefined>} Parsed response on success
 */
async function fetchAndStore(ctx, endpoint, storagePath, errorLabel) {
  try {
    const response = await fetchGetDX(endpoint, ctx.config);
    const result = await storeRaw(
      ctx.supabase,
      storagePath,
      JSON.stringify(response),
    );
    if (result.stored) ctx.files.push(storagePath);
    else ctx.errors.push(result.error);
    return response;
  } catch (err) {
    ctx.errors.push(`${errorLabel}: ${err.message}`);
    return undefined;
  }
}

/**
 * Fetch and store snapshot detail endpoints (info + comments) for each
 * active snapshot.
 * @param {object} ctx
 * @param {Array} snapshots
 */
async function extractSnapshotDetails(ctx, snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.deleted_at) continue;
    const idParam = encodeURIComponent(snapshot.id);
    await fetchAndStore(
      ctx,
      `/snapshots.info?snapshot_id=${idParam}`,
      `getdx/snapshots-info/${snapshot.id}.json`,
      `snapshots.info(${snapshot.id})`,
    );
    await fetchAndStore(
      ctx,
      `/snapshots.comments.list?snapshot_id=${idParam}`,
      `getdx/snapshots-comments/${snapshot.id}.json`,
      `snapshots.comments.list(${snapshot.id})`,
    );
  }
}

/**
 * Extract: fetch and store raw GetDX API responses.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {GetDXConfig} config
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (clock).
 * @returns {Promise<{files: Array<string>, errors: Array<string>}>}
 */
export async function extractGetDX(supabase, config, runtime) {
  const ctx = { supabase, config, files: [], errors: [] };
  const timestamp = isoTimestamp(runtime.clock.now());

  await fetchAndStore(
    ctx,
    "/teams.list",
    `getdx/teams-list/${timestamp}.json`,
    "teams.list",
  );

  const snapshotsResponse = await fetchAndStore(
    ctx,
    "/snapshots.list",
    `getdx/snapshots-list/${timestamp}.json`,
    "snapshots.list",
  );
  if (snapshotsResponse) {
    await extractSnapshotDetails(ctx, snapshotsResponse.snapshots || []);
  }

  await fetchAndStore(
    ctx,
    "/initiatives.list",
    `getdx/initiatives-list/${timestamp}.json`,
    "initiatives.list",
  );

  return { files: ctx.files, errors: ctx.errors };
}

/**
 * Fetch JSON from the GetDX API.
 * @param {string} endpoint
 * @param {GetDXConfig} config
 * @returns {Promise<object>}
 */
async function fetchGetDX(endpoint, config) {
  const url = new URL(endpoint, config.baseUrl);
  const response = await fetch(url.href, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `GetDX API ${endpoint}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}
