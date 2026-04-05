Introduce yourself to the agent and give them the following task:

Tell the agent to try out the Forward Impact Guide product for the first time.
They should start at www.forwardimpact.team, find the Guide product page, and
follow the instructions to install and run fit-guide.

1. Install the @forwardimpact/guide package from npm
2. Follow any setup instructions from the documentation
3. Run at least three different fit-guide prompts — try asking it about skills,
   career progression, or engineering practices
4. Summarize their experience in their final output, including:
   - How clear the installation instructions were
   - Whether the commands worked as documented
   - How useful the responses were
   - Any errors or confusing moments

The agent should not write findings to files — all findings should be in their
output so you can analyze them directly. They should work independently and
install from npm as a user would, not clone the monorepo.

Observe the agent's progress, answer any questions it has, and provide guidance
when it gets stuck. When you are satisfied the agent has completed the task
adequately, say EVALUATION_COMPLETE in your response, then continue with
post-evaluation work in the same turn.

After signaling success, create GitHub issues for the bugs, documentation gaps,
and product-aligned improvements the agent reported. Use `gh issue create` for
each actionable item. Skip feedback that is environmental or outside product
control. Include a summary of all issues created in your final output.
