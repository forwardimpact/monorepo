---
title: Guide
description: Career guidance and output review grounded in your organization's actual engineering standard. The advice is not generic.
layout: product
toc: false
hero:
  image: /assets/scene-guide.svg
  alt: An engineer, an AI robot holding a compass, and a business professional gathered together, finding their bearings
  subtitle: Find your bearing. Guide is an AI agent that understands your organization's engineering standard. That standard holds the skills, levels, and expectations that define what good looks like. Career guidance, output review, and onboarding grounded in your actual context.
  cta:
    - label: View on GitHub
      href: https://github.com/forwardimpact/monorepo/tree/main/products/guide
    - label: View on npm
      href: https://www.npmjs.com/package/@forwardimpact/guide
      secondary: true
---

A promotion conversation ends with 'not yet' but no specifics. You cannot tell
what evidence would change the answer. An agent delivers a PR. You can only
tell whether it meets the quality bar if you read every line. Guide resolves
both. It grounds career advice and output review in the organization's actual
engineering standard.

## What becomes possible

### For Empowered Engineers

Get guidance and evidence grounded in your organization's standard. The
guidance does not come from impressions or generic advice. Verify agent work
against the standard. You then review by exception. You do not review by
default.

- Gap analysis between current level and target, with specific skill
  recommendations
- Skill assessment that interprets engineering activity against standard markers
- Onboarding orientation grounded in actual team expectations
- Output review that checks deliverables against the organizational quality bar

---

## Getting Started

```sh
npm install @forwardimpact/guide
npx fit-codegen generate --all
npx fit-guide --init
```

Guide needs gRPC service clients that `fit-codegen` generates. It also needs a
configuration scaffold that `fit-guide --init` creates. After setup,
authenticate with Anthropic. Then process your standard data. See the
[Getting Started guide for engineers](/docs/getting-started/engineers/guide/)
for the full walkthrough.

After you configure it, use Guide from any of three surfaces:

```sh
npx fit-guide                         # CLI (Claude Agent SDK)
# Or connect via Claude Code / Claude Chat using the MCP endpoint
```

<div class="grid">

<!-- part:card:../docs/getting-started/engineers/guide -->

</div>
