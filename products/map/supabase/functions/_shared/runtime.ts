/**
 * Deno-safe runtime for Edge Function entry points.
 *
 * The transform modules take an injected runtime, but libutil's
 * `createDefaultRuntime` pulls Node-only imports, so Edge Functions
 * construct the one collaborator the transforms use here.
 */

export function createEdgeRuntime() {
  return { clock: { now: () => Date.now() } };
}
