/**
 * Resolve the Claude Code CLI the Agent SDK should spawn.
 *
 * `query()` spawns a native `claude` binary that the SDK resolves from its own
 * platform-specific optional dependency (`@anthropic-ai/claude-agent-sdk-<platform>`).
 * `bun build --compile` bundles the SDK's JavaScript. It does not bundle that
 * separate native package, which is not part of the import graph. So a
 * compiled fit-* binary cannot self-resolve it, and `query()` throws "Native
 * CLI binary for <platform> not found".
 *
 * In a compiled binary we point the SDK at the standalone `claude` on PATH.
 * The gemba-bootstrap action's `fit-install.sh` installs it beside gemba-harness. A
 * run from source keeps `node_modules`, where the SDK resolves its own
 * version-matched binary. There we return undefined and defer to the SDK.
 */
import { LIBCLI_IS_COMPILED } from "@forwardimpact/libcli";

/**
 * @param {object} [deps]
 * @param {(cmd: string) => string | null | undefined} [deps.which] -
 *   PATH resolver (tests inject it).
 * @param {boolean} [deps.isCompiled] -
 *   Whether this is a `bun --compile` binary (tests inject it).
 * @returns {string | undefined} absolute path to `claude`, or undefined to
 *   let the SDK resolve it.
 */
export function resolveClaudeCodeExecutable({
  which = defaultWhich,
  isCompiled = LIBCLI_IS_COMPILED,
} = {}) {
  if (!isCompiled) return undefined;
  return which("claude") ?? undefined;
}

/**
 * A compiled fit-* binary runs under the Bun runtime, which exposes a
 * synchronous PATH resolver. The `typeof` guard keeps this safe under Node too.
 */
function defaultWhich(cmd) {
  if (typeof Bun !== "undefined" && typeof Bun.which === "function") {
    return Bun.which(cmd);
  }
  return null;
}
