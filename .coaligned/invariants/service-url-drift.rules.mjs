// Keep every service's listen URL anchored to the URL its createServiceConfig
// manifest produces. Each registered consumer surface — the .env.*.example
// rows, the products/guide init.js env block, and the service-contract docs —
// must restate the manifest's URL; a disagreement fails here instead of
// silently drifting away from the one declared source.
//
// Source of truth: services/<name>/server.js createServiceConfig defaults,
// read statically and run through libconfig's network-default derivation by
// lib/expected-url.mjs. Comparison normalizes 0.0.0.0 / localhost / 127.0.0.1
// / <name>.guide.local (the host forms the librpc client maps between).
//
// The registry (service-url-drift.registry.yml) lists each service's manifest
// and consumer surfaces. Adding a service is a registry-only edit.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import { expectedUrl, urlsEqual } from "./lib/expected-url.mjs";

const REGISTRY = ".coaligned/invariants/service-url-drift.registry.yml";

// env/init both write SERVICE_<NAME>_URL=<url> or SERVICE_<NAME>_URL: "<url>";
// docs carry a registry `pattern` pinning a code-block / curl URL. Each
// consumer is scanned line-by-line with a native JS regex — ripgrep's default
// engine has no look-around and its single-file output omits the filename,
// which corrupts URL colons, so a direct read is both simpler and correct.
function consumerRegex(service, consumer) {
  if (consumer.kind === "docs") return new RegExp(consumer.pattern);
  const key = `SERVICE_${service.toUpperCase()}_URL`;
  return new RegExp(`${key}[=:][ \\t]*"?((?:grpc|http)://[^"'\\s,]+)`);
}

function restatements({ root, service, consumer, expected }) {
  const re = consumerRegex(service, consumer);
  const text = readFileSync(resolve(root, consumer.path), "utf8");
  const subjects = [];
  text.split("\n").forEach((line, i) => {
    const m = line.match(re);
    if (m) {
      subjects.push({
        service,
        path: consumer.path,
        lineNo: i + 1,
        restated: (m[1] ?? m[0]).trim(),
        expected,
      });
    }
  });
  return subjects;
}

export default {
  name: "service-url-drift",

  async build({ root }) {
    const registry = parseYaml(readFileSync(resolve(root, REGISTRY), "utf8"));
    const subjects = [];
    for (const [service, entry] of Object.entries(registry.services ?? {})) {
      const expected = expectedUrl(root, entry.manifest, service);
      for (const consumer of entry.consumers ?? []) {
        subjects.push(...restatements({ root, service, consumer, expected }));
      }
    }
    return { subjects: { "url-restatement": subjects } };
  },

  rules: [
    {
      id: "service-url.drift",
      scope: "url-restatement",
      severity: "fail",
      check: (s) =>
        urlsEqual(s.restated, s.expected, s.service)
          ? null
          : { restated: s.restated },
      message: (s) =>
        `${s.service}: ${s.path}:${s.lineNo} restates ${s.restated}, expected ${s.expected}`,
      hint: "align the consumer to the service's createServiceConfig URL, or update the manifest if the URL itself changed",
    },
  ],
};
