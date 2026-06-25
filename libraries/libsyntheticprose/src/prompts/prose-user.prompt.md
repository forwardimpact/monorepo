Write {{length}} of {{tone}} prose about: {{topic}}. {{#orgName}} Company name:
{{orgName}} (always use this exact capitalization). {{/orgName}} {{#domain}}
Company domain: {{domain}} (use only in URLs, never as the company name in
prose). {{/domain}} {{#role}} Written from the perspective of: {{role}}.
{{/role}} {{#audience}} Target audience: {{audience}}. {{/audience}}
{{#scenario}} Context: during "{{scenario}}", the {{driver}} driver is
{{direction}} (magnitude: {{magnitude}}). {{/scenario}} {{#driverContext}}
DX context for the author's team:
{{{driverContext}}}
Reflect these conditions in the writing style:
- If documentation is declining, omit explanatory context.
- If code-review is declining, keep feedback brief and surface-level.
- If deep-work is declining, the code may show signs of interruption-driven work.
- If managing-tech-debt is declining, the change may skip cleanup opportunities.
- If ease-of-release is declining, the PR may lack deployment notes.
- If clear-direction is declining, the description may be vague about motivation.
{{/driverContext}} Output the text only, no explanations.
