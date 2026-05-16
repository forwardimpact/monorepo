Conduct a JTBD switching interview using the `kata-interview` skill.

The skill defines the protocol: pick a product and a JTBD job, ground the
persona in this installation's synthetic content, write a persona-only
`$AGENT_CWD/CLAUDE.md`, hand off in two `Ask` calls
(introduction, then job delivery), and capture findings against the
chosen job.

If a `Product:` or `Job:` line is appended below, honour it; otherwise the
skill picks. Any other appended text is steering for the session — pass it
through to the agent as additional instruction in Ask 2.

This installation's synthetic content lives at `data/synthetic/` (output
of `bunx fit-terrain build`) — `story.dsl` for the org structure and
people, `prose-cache.json` for generated prose. The agent workspace gets
the per-product subset staged per the skill's Step 3 table.
