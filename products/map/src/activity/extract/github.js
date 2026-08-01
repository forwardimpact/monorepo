/**
 * GitHub Extract
 *
 * Receives a raw GitHub webhook payload and stores it as-is in Supabase
 * Storage. It does not extract fields. It does not normalize artifacts. It
 * does not resolve emails.
 */

import { isoTimestamp } from "@forwardimpact/libutil";
import { storeRaw } from "../storage.js";

/**
 * Extract: store a raw GitHub webhook payload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.deliveryId - X-GitHub-Delivery header
 * @param {string} params.eventType - X-GitHub-Event header
 * @param {object} params.payload - Raw webhook body
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (clock).
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractGitHubWebhook(
  supabase,
  { deliveryId, eventType, payload },
  runtime,
) {
  const path = `github/${deliveryId}.json`;
  const document = JSON.stringify({
    delivery_id: deliveryId,
    event_type: eventType,
    received_at: isoTimestamp(runtime.clock.now()),
    payload,
  });
  return storeRaw(supabase, path, document);
}
