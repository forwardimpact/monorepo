Write {{length}} of {{tone}} prose about: {{topic}}. {{#orgName}} Company name:
{{orgName}}. Always use this exact capitalization. {{/orgName}} {{#domain}}
Company domain: {{domain}}. Use the domain only in URLs. Do not use the domain
as the company name in prose. {{/domain}} {{#role}} Write from the perspective
of: {{role}}. {{/role}} {{#audience}} Target audience: {{audience}}.
{{/audience}} {{#scenario}} Context: during "{{scenario}}", the {{driver}}
driver is {{direction}} (magnitude: {{magnitude}}). {{/scenario}}
{{#driverContext}}
DX context for the author's team:
{{{driverContext}}}
Show these conditions in the text you write:

- If documentation declines, omit explanatory context.
- If code-review declines, keep feedback brief and surface-level.
- If deep-work declines, the code can show signs of interrupted work.
- If managing-tech-debt declines, the change can skip cleanup opportunities.
- If ease-of-release declines, the PR can lack deployment notes.
- If clear-direction declines, the description can be vague about the
  motivation.
{{/driverContext}} Output the text only. Do not add explanations.
