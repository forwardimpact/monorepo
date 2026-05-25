function partition(findings) {
  const failures = [];
  const warnings = [];
  for (const f of findings) {
    if (f.level === "warn") warnings.push(f);
    else failures.push(f);
  }
  return { failures, warnings };
}

/** Render findings as `WARN`/`FAIL` lines followed by a `RESULT:` trailer. */
export function emitText(findings) {
  const { failures, warnings } = partition(findings);
  const lines = [];
  for (const w of warnings) lines.push(`WARN ${w.message}`);
  for (const f of failures) lines.push(`FAIL ${f.message}`);
  lines.push(
    failures.length === 0
      ? "RESULT: pass"
      : `RESULT: fail (${failures.length} checks failed)`,
  );
  return lines.join("\n") + "\n";
}

/** Render findings as a JSON document. */
export function emitJson(findings) {
  const { failures, warnings } = partition(findings);
  return (
    JSON.stringify(
      {
        result: failures.length === 0 ? "pass" : "fail",
        failures,
        warnings,
      },
      null,
      2,
    ) + "\n"
  );
}
