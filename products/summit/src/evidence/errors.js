import { SupabaseUnavailableError } from "../lib/supabase.js";

/**
 * Summit throws this error when it cannot reach the evidence layer. It
 * extends SupabaseUnavailableError. Command handlers can then branch on
 * one catch across the roster and evidence paths.
 */
export class EvidenceUnavailableError extends SupabaseUnavailableError {
  /** Create an EvidenceUnavailableError with the underlying failure reason. */
  constructor(reason) {
    super(reason);
    this.code = "SUMMIT_EVIDENCE_UNAVAILABLE";
  }
}
