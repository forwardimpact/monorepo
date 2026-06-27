# Documentation Map

## Getting Started Map

| Persona             | Hub path                        | Product pages                     |
| ------------------- | ------------------------------- | --------------------------------- |
| Engineering Leaders | `getting-started/leaders/`      | Map, Pathway, Landmark, Summit    |
| Engineers           | `getting-started/engineers/`    | Pathway, Guide, Landmark, Outpost |
| Contributors        | `getting-started/contributors/` | (monorepo setup)                  |

## Guide Map

Every guide maps to a Big Hire or Little Hire from [JTBD.md](/JTBD.md),
[libraries/README.md](/libraries/README.md), or
[services/README.md](/services/README.md). Big Hire guides are directory roots;
Little Hire guides are nested children. A job formed by merging earlier jobs
keeps multiple Big Hire trees — slugs are published URLs and do not move
(see [CLAUDE.md § Guide Pages](CLAUDE.md)).

### Product Guides

**Define the Engineering Standard** (Leaders → Map)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `authoring-standards/` | Authoring Agent-Aligned Engineering Standards |
| Little | `authoring-standards/update-standard/` | Validate and Update the Standard |
| Little | `authoring-standards/define-role/` | Define a New Role |

**See What's Expected of Humans and Agents** (Engineers → Pathway)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `career-paths/` | See What's Expected at Your Level |
| Little | `career-paths/autonomy-scope/` | Understand Autonomy and Scope |
| Big | `agent-teams/` | Configure Agents to Meet Your Engineering Standard |
| Little | `agent-teams/organizational-context/` | Give Agents Organizational Context |

**Get Judgment Grounded in the Standard** (Engineers → Guide)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `growth-areas/` | Get Career Guidance Grounded in the Standard |
| Little | `growth-areas/growth-question/` | Ask a Growth Question |
| Little | `growth-areas/check-progress/` | Check Progress Toward Next Level |
| Big | `trust-output/` | Get Output Review Grounded in the Standard |
| Little | `trust-output/second-opinion/` | Get a Second Opinion on a Deliverable |
| Little | `trust-output/expected-output/` | See What the Standard Expects Before Reviewing |
| Little | `signing-in-to-landmark/` | Sign In to Landmark |
| Little | `engineering-data-sources/` | List Engineering Data Sources |

**Measure Engineering Outcomes** (Leaders → Landmark)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `engineering-outcomes/` | Demonstrate Engineering Progress |
| Little | `engineering-outcomes/culture-investments/` | Tell Whether Culture Investments Are Working |
| Little | `provisioning-engineers/` | Provision Engineer Auth Users |
| Little | `issuing-service-account-tokens/` | Issue Service-Account Tokens |

**Staff Teams to Succeed** (Leaders → Summit)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `team-capability/` | Make Staffing Decisions You Can Defend |
| Little | `team-capability/evaluate-candidate/` | Evaluate a Candidate Against Team Gaps |
| Little | `team-capability/surface-gaps/` | Surface Capability Gaps |

**Be Prepared and Productive** (Engineers → Outpost)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `knowledge-systems/` | Keep Track of Context Without Effort |
| Little | `knowledge-systems/meeting-prep/` | Walk Into Every Meeting Already Oriented |

### Library Guides

**Operate a Predictable Agent Team** (Engineers → libwiki, libxmr)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `predictable-team/` | Set Up Persistent Memory and Metrics |
| Little | `predictable-team/wiki-operations/` | Send a Memo or Update a Storyboard |
| Little | `predictable-team/wiki-integrity/` | Audit and Auto-Fix the Wiki |
| Little | `predictable-team/collision-ledger/` | Allocate Collision-Ledger Entries for Parallel Work |
| Little | `predictable-team/xmr-analysis/` | Chart a Metric and Check Variation |

**Coordinate an Agent Team** (Builders → libbridge, libharness)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `coordinate-team/` | Coordinate an Agent Team |
| Big | `bridge-channels/` | Bridge a Threaded Channel to the Agent Team |

**Enable Agents on Every Surface** (Builders → libcli, libdoc, libformat, librepl, libtemplate, libui)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `every-surface/` | Give Agents and Humans the Same Interface |
| Little | `every-surface/add-capability/` | Add a Capability to Both Surfaces |
| Little | `every-surface/build-web-surface/` | Build a Web Surface with libui |
| Little | `every-surface/interactive-repl/` | Build an Interactive REPL |
| Little | `every-surface/publish-docs/` | Publish a Documentation Site |
| Little | `every-surface/render-templates/` | Render Templates with Project Overrides |

**Ground Agents in Context** (Builders → libgraph, libindex, libresource, libvector)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `ground-agents/` | Give Agents Typed, Retrievable Knowledge |
| Little | `ground-agents/query-graph/` | Query a Knowledge Graph |
| Little | `ground-agents/lookup-context/` | Look Up Context Fast |
| Little | `ground-agents/resolve-resource/` | Resolve a Resource |
| Little | `ground-agents/search-semantically/` | Search Semantically |

**Integrate with the Engineering Standard** (Builders → libskill)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `integrate-standard/` | Turn Standard Definitions into Queryable Data |
| Little | `integrate-standard/derive-profile/` | Derive a Skill Matrix or Agent Profile |

**Keep Service Contracts Typed** (Builders → libproto, libtype, libcodegen, libmcp, librpc, libhttp)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `typed-contracts/` | Keep Types Synced with Proto Definitions |
| Little | `typed-contracts/expose-tool/` | Expose a Proto Method as an Agent Tool |
| Little | `typed-contracts/ship-endpoint/` | Ship a Service Endpoint |
| Little | `typed-contracts/ship-http-endpoint/` | Ship an HTTP Service Endpoint |

**Run a Predictable Platform** (Builders → libpreflight, librc, libsupervise, libtelemetry, libcoaligned)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `service-lifecycle/` | Manage Service Lifecycle from One Interface |
| Little | `service-lifecycle/manage-service/` | Start, Stop, or Check a Service |
| Little | `service-lifecycle/add-observability/` | Add Observability |

**Prove Agent Changes** (Builders → libharness, libterrain)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `prove-changes/` | Prove Agent Changes |
| Little | `prove-changes/run-eval/` | Run an Eval |
| Little | `prove-changes/run-benchmark/` | Run a Benchmark |
| Little | `prove-changes/run-benchmark/ci-workflow/` | Automate with GitHub Actions |
| Little | `prove-changes/trace-analysis/` | Analyze Traces |
| Little | `prove-changes/generate-dataset/` | Generate an Eval Dataset |

**Distribute Skill Packs** (Builders → libpack)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `distribute-skill-packs/` | Distribute Skill Packs |
| Little | `distribute-skill-packs/tarball-distribution/` | Build Tarball and Git-Repo Packs |
| Little | `distribute-skill-packs/discovery-index/` | Publish a Skill Discovery Index |

### Service Guides

**Bridge Conversations to the Agent Team** (Builders → ghbridge, msbridge, tenancy)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `bridge-conversations/` | Bridge Microsoft Teams to the Agent Team |
| Little | `bridge-conversations/dispatch-from-chat/` | Dispatch a Kata Session From a Teams Mention |
| Big | `bridge-discussions/` | Bridge GitHub Discussions to the Agent Team |
| Little | `bridge-discussions/resume-recessed/` | Resume a Recessed RFC When a Trigger Fires |

**Ground Agents in Context** (Builders → graph, vector, embedding, map)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `ground-agents/` | Traverse Knowledge and Search Semantically |
| Little | `ground-agents/query-graph/` | Answer Relationship Questions from a Product |
| Little | `ground-agents/search-content/` | Search for Related Content from a Product |
| Big | `embed-text/` | Embed Text Using a Shared Service |
| Little | `embed-text/embed-batch/` | Embed a Batch of Strings in One Call |

**Integrate with the Engineering Standard** (Builders → pathway)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `integrate-standard/` | Query the Engineering Standard from Any Product |
| Little | `integrate-standard/fetch-profile/` | Fetch a Derived Role or Agent Profile |

**Enable Agents on Every Surface** (Builders → mcp)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `typed-contracts/` | Expose Backend Services as Agent Tools |
| Little | `typed-contracts/add-service/` | Add a Service to the MCP Surface |

**Prove Agent Changes** (Builders → trace)

| Hire | Path | Title |
| ---- | ---- | ----- |
| Big | `prove-changes/` | Collect Trace Spans from Any Product |
| Little | `prove-changes/send-spans/` | Send Spans from a Product |
