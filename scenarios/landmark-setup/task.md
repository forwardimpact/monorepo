Introduce yourself to the agent and give them the following task:

Try the Forward Impact Landmark product for the first time. Start at
www.forwardimpact.team, find the Landmark product page, and follow the
instructions to install and set up fit-landmark.

The workspace is already prepared: synthetic framework data (`data/pathway/`)
and activity data (`data/activity/`) have been generated, and the Supabase CLI
is installed globally.

Exercise the product:

1. Install the @forwardimpact/landmark and @forwardimpact/map packages from npm
2. Start the local Supabase stack with `npx fit-map activity start`
3. Seed the activity database with `npx fit-map activity seed`
4. Run `npx fit-landmark org show` to see the organization directory
5. Run `npx fit-landmark health --manager <email>` using a manager email from
   the org output
6. Run `npx fit-landmark snapshot list` to see available snapshots
7. Run `npx fit-landmark evidence --email <email>` for an individual from the
   org
8. Run `npx fit-landmark readiness --email <email>` for the same individual
9. Run `npx fit-landmark voice --manager <email>` to see engineer voice comments
10. Summarize their experience in their final output, including:
    - Whether the Supabase stack started and data seeded successfully
    - How clear the setup instructions were
    - Whether the commands worked as documented
    - Whether the health, evidence, readiness, and voice views were
      understandable
    - Any errors or confusing moments

The agent should not write findings to files — all findings should be in their
output. They should work independently and install from npm as a user would, not
clone the monorepo.

Use the `product-evaluation` skill to supervise the session and capture
feedback.
