# Map Back to the Corpus

After you draft the spec and the design, re-read the corpus. Classify every
item. Then act on its disposition. The PR body lists only the addressed
buckets. **Out-of-scope items receive no comment and stay open**.

| Category | Trigger | Disposition |
| --- | --- | --- |
| **Directly addressed** | The meta-trigger. The spec resolves or absorbs the item. | Close as duplicate. Comment: "Spec NNN codifies `<move>`. The discipline would have surfaced this when …" |
| **Binding-constraint instrumented** | The item flagged the binding constraint. The spec adds the metric that reads it. | Close as duplicate. Comment: "Spec NNN Success #N adds `<metric>`, the permanent meter for the constraint this item exemplifies." |
| **Repair-move codified** | The item invented or applied a move the spec now names. | Close as duplicate. Comment: "Spec NNN names `<move>` in the typology. This item is the cited precedent." |
| **Superseded PR** | An open PR carved off a slice the consolidated spec now absorbs. | Close the PR and point at the consolidated spec PR. A PR that still ships independently stays open. |
| **Out of scope** | Spec's Scope (out) names the item or its category. | Leave it open. Add no comment. |
