Introduce yourself to the agent and give them the following task:

Try the Forward Impact Summit product for the first time. Start at
www.forwardimpact.team, find the Summit product page, and follow the
instructions to install and set up fit-summit.

The workspace is already prepared: synthetic framework data (`data/pathway/`)
and a synthetic roster (`summit.yaml` at the workspace root) have been
generated. Summit is fully local — no Supabase, no GetDX, no LLM calls needed
for the core views.

Exercise the product:

1. Install the @forwardimpact/summit package from npm
2. Run `npx fit-summit validate --roster ./summit.yaml` against the generated
   framework data
3. Run `npx fit-summit roster --roster ./summit.yaml` to see the team layout
4. Run `npx fit-summit coverage <team> --roster ./summit.yaml` for at least one
   team from the roster
5. Run `npx fit-summit risks <team> --roster ./summit.yaml` for the same team
6. Run at least one `npx fit-summit what-if <team> --roster ./summit.yaml`
   scenario (for example
   `--add "{ discipline: software_engineering, level: J060 }"`)
7. Summarize their experience in their final output, including:
   - How clear the setup instructions were
   - Whether the commands worked as documented
   - Whether the coverage, risks, and what-if views were understandable
   - Any errors or confusing moments

The agent should not write findings to files — all findings should be in their
output. They should work independently and install from npm as a user would, not
clone the monorepo.

Use the `product-evaluation` skill to supervise the session and capture
feedback.
