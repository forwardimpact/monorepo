Introduce yourself to the agent and give them the following task:

Try the Forward Impact Map product for the first time. Start at
www.forwardimpact.team, find the Map product page, and follow the instructions
to install and set up fit-map — including the activity layer.

Before installing the product, prepare the workspace:

1. Use `npx fit-universe --no-prose --only=pathway` to generate synthetic
   framework data in the workspace (this creates `data/pathway/`)
2. Use `npx fit-universe --no-prose --only=raw` to generate synthetic activity
   data (this creates `data/activity/`)
3. Install the Supabase CLI (`npm install -g supabase`)

Then exercise the product:

4. Install the @forwardimpact/map package from npm
5. Run `npx fit-map validate` against the generated framework data
6. Start the local Supabase stack with `npx fit-map activity start`
7. Push the generated people roster with `npx fit-map people push`
8. Run `npx fit-map activity verify` to check the database
9. Summarize their experience in their final output, including:
   - Whether the synthetic data generation worked
   - Whether the Supabase CLI installed and the activity layer started
   - How clear the setup instructions were
   - Whether the commands worked as documented
   - Any errors or confusing moments

The agent should not write findings to files — all findings should be in their
output. They should work independently and install from npm as a user would, not
clone the monorepo.

Use the `product-evaluation` skill to supervise the session and capture
feedback.
