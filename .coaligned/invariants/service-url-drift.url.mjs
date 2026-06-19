// Domain helper for the service-url-drift invariant (and the adjacent audit
// script + test). NOT generic mechanism — it lives beside its rule, not in a
// shared kit: it encodes how a service's listen URL is derived.
//
// A service's listen URL is the single source of truth declared in its
// `createServiceConfig("<name>", { … })` defaults. `server.js` is a
// side-effecting entrypoint (top-level `await service.start()`), so its
// defaults cannot be read by import — they are extracted statically from the
// AST and run through libconfig's documented network-default derivation
// (libraries/libconfig/src/config.js `load()`).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse as acornParse } from "acorn";

// Minimal acorn parse + depth-first walk. This file is imported directly by a
// test and an audit script (outside the invariant engine), so it carries its
// own AST helpers rather than depending on the kit it cannot import.
function parseModule(source, filePath) {
  try {
    return acornParse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
}

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walkAst(node[key], visit);
  }
}

/**
 * Error thrown when a service's `createServiceConfig` defaults are not a static
 * object literal the AST can read (e.g. a computed/spread defaults object).
 */
export class NonLiteralDefaultsError extends Error {}

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === "Literal") return node.value;
  // Numeric separators (e.g. 600_000) parse as Literal; bare identifiers and
  // expressions are not static values.
  return undefined;
}

const NETWORK_KEYS = new Set(["protocol", "host", "port", "path"]);

function isCreateServiceConfigCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "createServiceConfig"
  );
}

function readNetworkKeys(objectExpression) {
  const out = {};
  for (const prop of objectExpression.properties) {
    if (prop.type !== "Property" || prop.key?.type !== "Identifier") continue;
    if (!NETWORK_KEYS.has(prop.key.name)) continue;
    const value = literalValue(prop.value);
    if (value !== undefined) out[prop.key.name] = value;
  }
  return out;
}

/**
 * Extract the static `protocol`/`host`/`port`/`path` defaults a service passes
 * to `createServiceConfig`, or `{}` when the call has no defaults argument.
 *
 * @param {string} source - Module source text.
 * @param {string} filePath - Path used in parse-error messages.
 * @param {string} serviceName - The first `createServiceConfig` argument.
 * @returns {{ protocol?: string, host?: string, port?: number, path?: string }}
 */
export function extractDefaults(source, filePath, serviceName) {
  const ast = parseModule(source, filePath);
  let found;
  walkAst(ast, (node) => {
    if (found || !isCreateServiceConfigCall(node)) return;
    const [nameArg, defaultsArg] = node.arguments;
    if (nameArg?.type !== "Literal" || nameArg.value !== serviceName) return;
    if (defaultsArg === undefined) {
      found = {};
      return;
    }
    if (defaultsArg.type !== "ObjectExpression") {
      throw new NonLiteralDefaultsError(
        `${filePath}: createServiceConfig("${serviceName}", …) defaults are not a static object literal`,
      );
    }
    found = readNetworkKeys(defaultsArg);
  });
  if (!found) {
    throw new Error(
      `${filePath}: no createServiceConfig("${serviceName}", …) call found`,
    );
  }
  return found;
}

/**
 * Compute a service's manifest-declared listen URL, replaying libconfig's
 * network-default derivation (config.js:150-154).
 *
 * @param {string} root - Repository root.
 * @param {string} manifestPath - `server.js` path relative to root.
 * @param {string} serviceName - The service's `createServiceConfig` name.
 * @returns {string} e.g. `grpc://0.0.0.0:3001`.
 */
export function expectedUrl(root, manifestPath, serviceName) {
  const abs = resolve(root, manifestPath);
  const defaults = extractDefaults(readFileSync(abs, "utf8"), abs, serviceName);
  const protocol = defaults.protocol ?? "grpc";
  const host = defaults.host ?? "0.0.0.0";
  const port = defaults.port ?? 3000;
  const path = defaults.path ?? "";
  return `${protocol}://${host}:${port}${path}`;
}

/**
 * Collapse the host representations that denote the same local endpoint to one
 * token. The manifest binds `0.0.0.0`; consumers and the librpc client
 * (client.js:54-57, which maps `0.0.0.0` → `<name>.guide.local`) advertise
 * `localhost`. URL equality must see through that.
 *
 * @param {string} host
 * @param {string} serviceName
 * @returns {string}
 */
export function normalizeHost(host, serviceName) {
  const local = new Set([
    "0.0.0.0",
    "localhost",
    "127.0.0.1",
    `${serviceName}.guide.local`,
  ]);
  return local.has(host) ? "localhost" : host;
}

/**
 * URL equality on protocol + port + normalized host.
 *
 * @param {string} a
 * @param {string} b
 * @param {string} serviceName
 * @returns {boolean}
 */
export function urlsEqual(a, b, serviceName) {
  const ua = new URL(a);
  const ub = new URL(b);
  return (
    ua.protocol === ub.protocol &&
    ua.port === ub.port &&
    normalizeHost(ua.hostname, serviceName) ===
      normalizeHost(ub.hostname, serviceName)
  );
}
