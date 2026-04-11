import { SupabaseUnavailableError } from "../lib/supabase.js";

/**
 * Thrown when Summit cannot reach the evidence layer. Extends
 * SupabaseUnavailableError so command handlers can branch on one
 * catch across roster + evidence paths.
 */
export class EvidenceUnavailableError extends SupabaseUnavailableError {
  constructor(reason) {
    super(reason);
    this.code = "SUMMIT_EVIDENCE_UNAVAILABLE";
  }
}
