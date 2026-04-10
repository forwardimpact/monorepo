Introduce yourself to the agent and give them the following task:

Try the Forward Impact Map product for the first time. Start at
www.forwardimpact.team, find the Map product page, and follow the instructions
to install and set up fit-map — including the activity layer.

The workspace is already prepared: synthetic framework data (`data/pathway/`)
and activity data (`data/activity/`) have been generated, and the Supabase CLI
is installed globally.

Exercise the product:

1. Install the @forwardimpact/map package from npm
2. Run `npx fit-map validate` against the generated framework data
3. Start the local Supabase stack with `npx fit-map activity start`
4. Push the generated people roster with `npx fit-map people push`
5. Run `npx fit-map activity verify` to check the database
6. Summarize their experience in their final output, including:
   - Whether the Supabase CLI and the activity layer started
   - How clear the setup instructions were
   - Whether the commands worked as documented
   - Any errors or confusing moments

The agent should not write findings to files — all findings should be in their
output. They should work independently and install from npm as a user would, not
clone the monorepo.

Use the `product-evaluation` skill to supervise the session and capture
feedback.
