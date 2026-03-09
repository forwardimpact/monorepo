/**
 * GitHub Extract
 *
 * Receives a raw GitHub webhook payload and stores it as-is in Supabase
 * Storage. No field extraction, no artifact normalization, no email resolution.
 */

import { storeRaw } from "../storage.js";

/**
 * Extract: store a raw GitHub webhook payload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.deliveryId - X-GitHub-Delivery header
 * @param {string} params.eventType - X-GitHub-Event header
 * @param {object} params.payload - Raw webhook body
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractGitHubWebhook(
  supabase,
  { deliveryId, eventType, payload },
) {
  const path = `github/${deliveryId}.json`;
  const document = JSON.stringify({
    delivery_id: deliveryId,
    event_type: eventType,
    received_at: new Date().toISOString(),
    payload,
  });
  return storeRaw(supabase, path, document);
}
