// Generic rule-execution engine, paired with `libutil/findings.js` for output.
//
// A rule is `{ id, scope, severity, when?, check, message, hint? }`:
//
// - `scope` is an opaque string. The caller supplies a `resolveScope(scopeKey,
//   ctx)` function that returns the list of subjects for that scope. Subjects
//   carry whatever fields the rule's `check` and `message` functions read
//   (commonly `path`, `lineNo`, `text`, parsed-row fields, etc.).
// - `when(subject, ctx)` is an optional predicate — falsy skips the rule.
// - `check(subject, ctx)` returns `null` (clean), a single finding item, or
//   an array of finding items. Each item is a plain object whose fields the
//   rule's `message` function reads (e.g., `{ value: 572 }`).
// - `message(subject, item, ctx)` builds the human-readable message string.
// - `hint` is an optional action prompt rendered by the text emitter: either a
//   static string or a `(subject, item, ctx) => string` resolved once per
//   finding. A function hint lets a rule emit a fully resolved command from the
//   subject (e.g. a `rotate --agent <prefix>` naming the flagged file's agent).
//
// `ctx` is passed unchanged to every rule. Cross-subject state (e.g., a
// duplicate-detection map) lives on `ctx` and is mutated by the rule during
// iteration — the engine iterates rules grouped by scope in stable order.

function groupByScope(rules) {
  const groups = new Map();
  for (const rule of rules) {
    if (!groups.has(rule.scope)) groups.set(rule.scope, []);
    groups.get(rule.scope).push(rule);
  }
  return groups;
}

function applyRule(rule, subject, ctx) {
  if (rule.when && !rule.when(subject, ctx)) return [];
  const result = rule.check(subject, ctx);
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  return items.map((item) => ({
    id: rule.id,
    level: rule.severity,
    path: subject.path ?? null,
    lineNo: item.lineNo ?? subject.lineNo ?? null,
    message: rule.message(subject, item, ctx),
    hint:
      typeof rule.hint === "function"
        ? rule.hint(subject, item, ctx)
        : (rule.hint ?? null),
  }));
}

/** Apply a declarative rule catalogue against a context with an injected scope resolver. Returns a flat Finding[]. */
export function runRules(rules, ctx, { resolveScope }) {
  const findings = [];
  for (const [scopeKey, scopeRules] of groupByScope(rules)) {
    for (const subject of resolveScope(scopeKey, ctx)) {
      for (const rule of scopeRules) {
        findings.push(...applyRule(rule, subject, ctx));
      }
    }
  }
  return findings;
}
