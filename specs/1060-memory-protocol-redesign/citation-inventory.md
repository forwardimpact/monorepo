# Citation Inventory — Spec 1060

Inventory of call sites carrying the old memory-protocol terminology
(`#action-routing` anchor, `Tier 1/2` headings, `Memory Tiers` heading,
`80-line` cap, `Cross-Cutting Priority Index`, `wiki-audit.sh`). Status column
maps each call site to the part that lands the update; rows tagged
`historical exempt` are research artifacts dated 2026-05-16 or pre-cutover
weekly logs.

Built via `rg -n 'memory-protocol|MEMORY\.md|<!-- memo:inbox -->|80-line|Tier
1|Tier 2|Memory Tiers|Cross-Cutting Priority|Action Routing|wiki-audit\.sh|action-routing'
.claude/ CONTRIBUTING.md KATA.md` at the Part 02 commit.

| Call site | Status |
| --- | --- |
| `CONTRIBUTING.md:82` (DO-CONFIRM wiki writes) | edited in Part 02 |
| `KATA.md:90` (`#action-routing` → `#on-boot-routing`) | edited in Part 02 |
| `KATA.md:91` (Active Claims surface mention) | edited in Part 02 |
| `KATA.md:241` (Read contract sentence) | edited in Part 02 |
| `KATA.md:255` (Read contract sentence) | edited in Part 02 |
| `.claude/agents/improvement-coach.md:35-36` Step 0 line | edited in Part 03 |
| `.claude/agents/improvement-coach.md:55` Memory reference line | edited in Part 03 |
| `.claude/agents/release-engineer.md:33-34` Step 0 | edited in Part 03 |
| `.claude/agents/release-engineer.md:54` Memory reference | edited in Part 03 |
| `.claude/agents/staff-engineer.md:38-39` Step 0 | edited in Part 03 |
| `.claude/agents/staff-engineer.md:54` Memory reference | edited in Part 03 |
| `.claude/agents/technical-writer.md:36-37` Step 0 | edited in Part 03 |
| `.claude/agents/technical-writer.md:60` Memory reference | edited in Part 03 |
| `.claude/agents/security-engineer.md:35-36` Step 0 | edited in Part 03 |
| `.claude/agents/security-engineer.md:58` Memory reference | edited in Part 03 |
| `.claude/agents/product-manager.md:37-38` Step 0 | edited in Part 03 |
| `.claude/agents/product-manager.md:58` Memory reference | edited in Part 03 |
| `.claude/agents/references/coordination-protocol.md:25` `#on-boot-routing` anchor | edited in Part 02 |
| `.claude/agents/references/coordination-protocol.md:5,228,266` link citations (anchor-stable) | matches new |
| `.claude/agents/references/memory-protocol.md` (full rewrite) | edited in Part 02 |
| `.claude/skills/kata-design/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-documentation/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-implement/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-interview/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-plan/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-product-issue/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-release-cut/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-release-merge/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-security-audit/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-security-update/SKILL.md` Step 0 | edited in Part 03 |
| `.claude/skills/kata-wiki-curate/SKILL.md` Step 0 + audit reference | edited in Part 03 |
| `.claude/skills/fit-wiki/SKILL.md` subcommand sections | edited in Part 03 |
| `justfile:wiki-audit recipe` (`scripts/wiki-audit.sh` body) | edited in Part 04 |
| `scripts/wiki-audit.sh` (deleted; absorbed by `fit-wiki audit`) | edited in Part 04 |
| `wiki/MEMORY.md` `## Active Claims` scaffold | edited via `fit-wiki init` (Part 04) and Part 05 migration |
| `wiki/<agent>-YYYY-Www.md` for ISO week < 2026-W23 (pre-cutover) | historical exempt; migration in Part 05 partitions over-budget files |
| `wiki/memory-protocol-*-2026-05-16.md` research corpus (five files) | historical exempt — spec § Success Criteria row 13 disallows edits |
| `wiki/STATUS.md` (canonical record reference) | matches new |

After Part 05 lands, the only rows tagged `historical exempt` are the five
2026-05-16 research-corpus files. Every other call site is on the new
terminology, mechanically.
