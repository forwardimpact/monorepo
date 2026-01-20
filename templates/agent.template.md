{{#frontmatter}}---
{{#name}}name: {{name}}
{{/name}}description: {{{description}}}
{{#tools}}tools: {{{tools}}}
{{/tools}}{{#infer}}infer: {{infer}}
{{/infer}}{{#handoffs}}handoffs:
{{#.}}  - label: {{label}}
{{#agent}}    agent: {{agent}}
{{/agent}}    prompt: {{{prompt}}}
{{#send}}    send: {{send}}
{{/send}}{{/.}}
{{/handoffs}}---

{{/frontmatter}}{{{body}}}
