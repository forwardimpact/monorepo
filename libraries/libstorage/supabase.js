import { S3Storage } from "./s3.js";

/**
 * Supabase-specific S3-compatible storage implementation.
 * Handles Supabase's non-standard bucket creation API and health checks.
 * @augments S3Storage
 */
export class SupabaseStorage extends S3Storage {
  #storageUrl;
  #serviceRoleKey;

  /**
   * Creates a new SupabaseStorage instance
   * @param {string} prefix - Prefix for all storage operations
   * @param {string} bucket - S3 bucket name
   * @param {object} client - S3 client instance
   * @param {string} storageUrl - Supabase storage URL (without /s3 suffix)
   * @param {string} serviceRoleKey - Supabase service role key for admin operations
   * @param {object} [commands] - S3 command classes (for testing)
   * @throws {Error} If serviceRoleKey is missing
   */
  constructor(prefix, bucket, client, storageUrl, serviceRoleKey, commands) {
    if (!serviceRoleKey) {
      throw new Error(
        "SupabaseStorage requires serviceRoleKey for bucket operations",
      );
    }
    super(prefix, bucket, client, commands);
    this.#storageUrl = storageUrl;
    this.#serviceRoleKey = serviceRoleKey;
  }

  /**
   * Check if the Supabase storage service is reachable.
   * Uses the Supabase Storage REST API status endpoint instead of S3 HeadBucket,
   * since Supabase's S3 compatibility layer may not properly handle HeadBucket.
   * @returns {Promise<boolean>} True if storage service is reachable
   */
  async isHealthy() {
    try {
      const response = await fetch(`${this.#storageUrl}/status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.#serviceRoleKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensures the storage bucket exists using Supabase REST API.
   * Supabase doesn't support S3 CreateBucketCommand.
   * @returns {Promise<boolean>} True if bucket was created
   */
  async ensureBucket() {
    const response = await fetch(`${this.#storageUrl}/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: this._bucket, public: false }),
    });

    // Success - bucket was created
    if (response.ok) {
      return true;
    }

    // Check for duplicate/already exists errors
    // Supabase may return 409, or 400 with statusCode "409" in body
    if (response.status === 409) {
      return false;
    }

    const text = await response.text();
    try {
      const body = JSON.parse(text);
      if (body.statusCode === "409" || body.error === "Duplicate") {
        return false;
      }
    } catch {
      // Not JSON, continue to throw
    }

    throw new Error(
      `Failed to create Supabase bucket: ${response.status} ${text}`,
    );
  }
}
