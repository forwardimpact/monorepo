/**
 * GetDX Extract
 *
 * Fetches from the GetDX REST API and stores the raw JSON responses in
 * Supabase Storage. Each API call produces one stored document.
 */

import { storeRaw } from "../storage.js";

/**
 * @typedef {object} GetDXConfig
 * @property {string} apiToken - GetDX API token
 * @property {string} baseUrl - GetDX API base URL
 */

/**
 * Extract: fetch and store raw GetDX API responses.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {GetDXConfig} config
 * @returns {Promise<{files: Array<string>, errors: Array<string>}>}
 */
export async function extractGetDX(supabase, config) {
  const files = [];
  const errors = [];
  const timestamp = new Date().toISOString();

  // teams.list
  try {
    const teamsResponse = await fetchGetDX("/teams.list", config);
    const path = `getdx/teams-list/${timestamp}.json`;
    const result = await storeRaw(
      supabase,
      path,
      JSON.stringify(teamsResponse),
    );
    if (result.stored) files.push(path);
    else errors.push(result.error);
  } catch (err) {
    errors.push(`teams.list: ${err.message}`);
  }

  // snapshots.list
  try {
    const snapshotsResponse = await fetchGetDX("/snapshots.list", config);
    const snapshotsPath = `getdx/snapshots-list/${timestamp}.json`;
    const snapshotsResult = await storeRaw(
      supabase,
      snapshotsPath,
      JSON.stringify(snapshotsResponse),
    );
    if (snapshotsResult.stored) files.push(snapshotsPath);
    else errors.push(snapshotsResult.error);

    // snapshots.info for each snapshot
    const snapshots = snapshotsResponse.snapshots || [];
    for (const snapshot of snapshots) {
      if (snapshot.deleted_at) continue;
      try {
        const infoResponse = await fetchGetDX(
          `/snapshots.info?snapshot_id=${encodeURIComponent(snapshot.id)}`,
          config,
        );
        const infoPath = `getdx/snapshots-info/${snapshot.id}.json`;
        const infoResult = await storeRaw(
          supabase,
          infoPath,
          JSON.stringify(infoResponse),
        );
        if (infoResult.stored) files.push(infoPath);
        else errors.push(infoResult.error);
      } catch (err) {
        errors.push(`snapshots.info(${snapshot.id}): ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(`snapshots.list: ${err.message}`);
  }

  return { files, errors };
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
