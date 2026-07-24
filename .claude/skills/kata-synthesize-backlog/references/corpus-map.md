# Mapping Back to Corpus

After the spec and design are drafted, re-read the corpus, classify every
item, then act on its disposition. The PR body lists only the addressed
buckets; **out-of-scope items receive no comment and stay open**.

| Category | Trigger | Disposition |
| --- | --- | --- |
| **Directly addressed** | The meta-trigger; the spec resolves or absorbs the item. | Close as duplicate. Comment: "Spec NNN codifies `<move>`; the discipline would have surfaced this when …" |
| **Binding-constraint instrumented** | The item flagged the binding constraint; the spec adds the metric that reads it. | Close as duplicate. Comment: "Spec NNN Success #N adds `<metric>`, the standing meter for the constraint this item exemplifies." |
| **Repair-move codified** | The item invented or applied a move the spec now names. | Close as duplicate. Comment: "Spec NNN names `<move>` in the typology; this item is the cited precedent." |
| **Superseded PR** | An open PR carved off a slice the consolidated spec now absorbs. | Close the PR, pointing at the consolidated spec PR. A PR still independently shippable stays open. |
| **Out of scope** | Spec's Scope (out) names the item or its category. | Leave open; no comment. |
