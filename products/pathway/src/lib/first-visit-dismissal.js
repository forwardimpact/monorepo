/**
 * Flag for the dismissal of the first-visit banner. It lives in localStorage.
 *
 * The banner shows on the Pathway landing page until the user dismisses it.
 * This module records the dismissal as one string value under
 * {@link STORAGE_KEY}. That leaves room for a future versioned re-show key
 * that does not collide with this one.
 *
 * The module guards every storage access. Private browsing, disabled storage,
 * and quota errors all degrade to "not dismissed". They never throw. It is
 * better to re-show the orientation than to break the landing render.
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
 * Report whether the user dismissed the first-visit banner in this browser.
 * @returns {boolean} false when storage is unavailable or the read fails.
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
 * Record that the user dismissed the first-visit banner.
 * A storage error (quota, disabled storage) causes a silent no-op. The banner
 * then re-shows on the next visit. Spec § 9 accepts that.
 * @returns {void}
 */
export function markDismissed() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, "1");
  } catch {
    /* on a quota error or disabled storage, accept a re-show on next visit */
  }
}
