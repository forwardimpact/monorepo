import { resolveScope } from "./scopes.js";

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
  const level = rule.graceDowngrade && ctx.grace ? "warn" : rule.severity;
  const items = Array.isArray(result) ? result : [result];
  return items.map((item) => ({
    id: rule.id,
    level,
    path: subject.path ?? null,
    message: rule.message(subject, item, ctx),
  }));
}

/** Apply the declarative rule catalogue to the wiki context. */
export function runAudit(rules, ctx) {
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
