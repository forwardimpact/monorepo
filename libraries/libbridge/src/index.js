/**
 * Canonical configuration contract every bridge consumes. Channel-specific
 * fields (e.g. `app_webhook_secret` on ghbridge, `msAppId()` on msbridge)
 * extend this — see each bridge's README for the channel-specific surface.
 *
 * @typedef {object} BridgeConfig
 * @property {string} host - Bind host (typically "127.0.0.1" or "0.0.0.0")
 * @property {number} port - Bind port; 0 selects a free port
 * @property {string} callback_base_url - Public URL the dispatched workflow posts back to
 * @property {string} github_repo - "owner/repo" hosting the kata-dispatch workflow
 */

export { createBridgeServer } from "./server.js";
export { CallbackRegistry } from "./callback-registry.js";
export { buildPrompt } from "./prompt.js";
export { appendHistory } from "./history.js";
export { RateLimiter } from "./rate-limit.js";
export { dispatchWorkflow } from "./dispatch.js";
export { DiscussionContextStore } from "./discussion-context.js";
export { OriginIndex } from "./origin-index.js";
export { ProgressTicker } from "./progress-ticker.js";
export {
  Acknowledgement,
  DEFAULT_TYPING_VERBS,
} from "./acknowledgement.js";
export { Dispatcher } from "./dispatcher.js";
export { TokenResolver } from "./token-resolver.js";
export {
  CallbackHandlerError,
  createCallbackHandler,
} from "./callback-handler.js";
export { ElapsedScheduler } from "./elapsed-scheduler.js";
export { ResumeScheduler } from "./resume-scheduler.js";
export {
  MAX_FIELD_LENGTH,
  MAX_REPLY_COUNT,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "./callback-payload.js";
export { evaluateTrigger, parseIsoDuration } from "./triggers.js";
