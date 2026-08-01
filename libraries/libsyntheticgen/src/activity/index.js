/**
 * ProseActivity — the uniform contract for prose-bearing activity
 * outputs across three pipeline stages. The stages generate
 * deterministic data, build the prose context, and render the output.
 *
 * Each in-scope prose-bearing output (snapshot comments, the GitHub
 * webhook stream) implements three methods on a single per-output
 * module: `generate`, `proseKeys`, `render`. The three pipeline call
 * sites iterate the `PROSE_ACTIVITIES` registration. They do not name
 * the outputs themselves. `engine/activity.js` composes the activities.
 * `engine/prose-keys.js` collects the prose contexts.
 * `libsyntheticrender/render/raw.js` renders the raw output.
 *
 * `ProseContext` is the single LLM-bound shape every prose-bearing
 * output's `proseKeys` emits. Its `drivers: DriverImpact[]` field
 * carries the full team-affect driver array end-to-end. The field
 * removes the asymmetry between the comment driver context and the
 * webhook driver context.
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
