// Keep every service's listen URL anchored to the URL its createServiceConfig
// manifest produces. Each registered consumer surface — the .env.*.example
// rows, the products/guide init.js env block, and the service-contract docs —
// must restate the manifest's URL; a disagreement fails here instead of
// silently drifting away from the one declared source.
//
// Source of truth: services/<name>/server.js createServiceConfig defaults,
// read statically and run through libconfig's network-default derivation by
// service-url-drift.url.mjs. Comparison normalizes 0.0.0.0 / localhost /
// 127.0.0.1 / <name>.guide.local (the host forms the librpc client maps
// between).
//
// The registry (service-url-drift.registry.yml) lists each service's manifest
// and consumer surfaces. Adding a service is a registry-only edit. The generic
// "single source restated across consumers" scan + compare is the build kit's
// `restatementDrift`; this module supplies only the domain pieces — the
// expected URL (expectedUrl) and the host-normalizing equality (urlsEqual).

import { expectedUrl, urlsEqual } from "./service-url-drift.url.mjs";

// env/init both write SERVICE_<NAME>_URL=<url> or SERVICE_<NAME>_URL: "<url>";
// docs carry a registry `pattern` pinning a code-block / curl URL.
function consumerRegex(service, consumer) {
  if (consumer.kind === "docs") return new RegExp(consumer.pattern);
  const key = `SERVICE_${service.toUpperCase()}_URL`;
  return new RegExp(`${key}[=:][ \\t]*"?((?:grpc|http)://[^"'\\s,]+)`);
}

export default {
  name: "service-url-drift",

  build({ root, config, restatementDrift }) {
    const registry = config("service-url-drift.registry.yml", {});
    const entries = Object.entries(registry.services ?? {}).map(
      ([service, entry]) => ({
        key: service,
        expected: expectedUrl(root, entry.manifest, service),
        consumers: (entry.consumers ?? []).map((consumer) => ({
          path: consumer.path,
          pattern: consumerRegex(service, consumer),
        })),
      }),
    );
    return {
      subjects: {
        "url-restatement": restatementDrift({ entries, equal: urlsEqual }),
      },
    };
  },

  rules: ({ failAll }) => [
    failAll("url-restatement", {
      id: "service-url.drift",
      when: (s) => !s.ok,
      message: (s) =>
        `${s.key}: ${s.path}:${s.lineNo} restates ${s.restated}, expected ${s.expected}`,
      hint: "align the consumer to the service's createServiceConfig URL, or update the manifest if the URL itself changed",
    }),
  ],
};
