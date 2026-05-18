/**
 * First-visit banner dismissal flag, backed by localStorage.
 *
 * The banner shows on the Pathway landing page until dismissed. Dismissal is
 * recorded as a single string value under {@link STORAGE_KEY} so we leave
 * room for a future versioned re-show key without colliding with this one.
 *
 * Storage access is guarded: private browsing, disabled storage, and quota
 * errors all degrade to "not dismissed" rather than throwing — re-showing the
 * orientation is preferable to breaking the landing render.
 */

const STORAGE_KEY = "pathway:first-visit-banner:dismissed";

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Has the first-visit banner been dismissed in this browser?
 * @returns {boolean} false when storage is unavailable or read fails.
 */
export function isDismissed() {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Record that the user has dismissed the first-visit banner.
 * Silent no-op on storage error (quota, disabled storage); the banner will
 * re-show on the next visit, which is acceptable per spec § 9.
 * @returns {void}
 */
export function markDismissed() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, "1");
  } catch {
    /* quota / disabled storage — accept re-show on next visit */
  }
}
