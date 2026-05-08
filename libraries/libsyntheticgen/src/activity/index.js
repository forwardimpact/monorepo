/**
 * ProseActivity contract — uniform binding for prose-bearing activity
 * outputs across deterministic generation, prose-context construction,
 * and output rendering.
 *
 * Each in-scope prose-bearing output (snapshot comments, the GitHub
 * webhook stream) implements three methods on a single per-output
 * module: `generate`, `proseKeys`, `render`. The three pipeline call
 * sites (activity composition in `engine/activity.js`, prose-context
 * collection in `engine/prose-keys.js`, raw rendering in
 * `libsyntheticrender/render/raw.js`) iterate the `PROSE_ACTIVITIES`
 * registration rather than naming the outputs themselves.
 *
 * `ProseContext` is the single LLM-bound shape every prose-bearing
 * output's `proseKeys` emits. Its `drivers: DriverImpact[]` field
 * carries the full team-affect driver array end-to-end, removing the
 * comment-vs-webhook driver-context asymmetry that motivated spec 820.
 *
 * @module libsyntheticgen/activity
 *
 * @typedef {{ driver_id: string, trajectory: string, magnitude: number }} DriverImpact
 *
 * @typedef {object} ProseContext
 * @property {string} topic
 * @property {string} tone
 * @property {string} length
 * @property {number} [maxTokens]
 * @property {string} [domain]
 * @property {string} [orgName]
 * @property {string} [role]
 * @property {string} [scenario]
 * @property {DriverImpact[]} [drivers]
 *
 * @typedef {{ ast: import('../dsl/parser.js').TerrainAST, rng: import('../engine/rng.js').SeededRNG, entities: object }} GenerateContext
 * @typedef {{ domain: string, orgName: string, entities: object }} ProseKeysContext
 *
 * @typedef {object} ProseActivity
 * @property {string} id
 * @property {(ctx: GenerateContext) => any} generate
 * @property {(output: any, ctx: ProseKeysContext) => Iterable<[string, ProseContext]>} proseKeys
 * @property {(output: any, files: Map<string,string>, prose: Map<string,string>|undefined) => void} render
 */

import { commentActivity } from "./comment.js";
import { webhookActivity } from "./webhook.js";

/** @type {ProseActivity[]} */
export const PROSE_ACTIVITIES = [commentActivity, webhookActivity];
