/**
 * Minimal hosted runtime.
 *
 * The hosted Edge Function surface needs only the `clock` that the activity
 * transforms and extracts dereference (`runtime.clock.now()`). It deliberately
 * omits the fs/proc/subprocess/finder surface of the CLI's default runtime,
 * which has no equivalent under the Deno runtime and which no hosted transform
 * touches.
 *
 * @returns {{ clock: { now: () => number } }}
 */
export function createHostedRuntime() {
  return Object.freeze({ clock: Object.freeze({ now: () => Date.now() }) });
}
