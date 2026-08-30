# Links

Reference for `extract-entities` Step 10 and Step 7c (Priorities). Every
skill that writes wiki links follows the format and overlay rules here.

## Link format

- In shared tiers (ranks 1 and up), write every wiki link tier-prefixed and
  vault-absolute: `[[3-Team/People/Sarah Chen]]`,
  `[[2-Confidential/Candidates/Jane Doe/brief]]`. A bare basename
  (`[[Sarah Chen]]`) is a validation finding there, because overlays
  duplicate basenames across tiers.
- Exemption: relative links between files inside one entity subdirectory (a
  per-candidate folder, an asset collection) stay relative, so the folder
  moves as one unit.
- Tier-0 notes may use bare basenames.
- Link only to the same tier or a wider one. `rank(target) >= rank(source)`
  always holds; the validator flags the rest.

## Overlay links

A sensitive facet of an entity lives as an **overlay** note in a narrower
tier. The overlay declares itself through its frontmatter `canonical`
property: a double-quoted, tier-prefixed, vault-absolute link to the
canonical note (`canonical: "[[3-Team/People/Jane Doe]]"`). The canonical
note **never links back**. Backlinks stay symmetric within one tier only; a
cross-tier reference is one-way, from the narrower note up.

## Bidirectional link rules

After you write, verify each link goes both ways **within the same tier**.

| If you add...          | Then also add...                             |
| ---------------------- | -------------------------------------------- |
| Person → Organization  | Organization → Person (in People section)    |
| Person → Project       | Project → Person (in People section)         |
| Project → Organization | Organization → Project (in Projects section) |
| Project → Priority     | Priority → Project (in Projects section)     |
| Condition → Project    | Project → Condition (in Related section)     |
| Condition → Role       | Role → Condition (notes or status field)     |

The Condition → Role pair crosses tiers (rank 3 → rank 2), so only the
narrower side links: the Role file may name the Condition, and the Condition
never names the Role.

## Priorities (Step 7c)

Match source themes against priority names and descriptions.

- Add `[[3-Team/Priorities/{Priority}]]` to a Project or Topic `## Related`
  section if it is not already present.
- Update the Priority's `## Projects` section when a new project emerges that
  serves it.

**Never auto-create Priorities.** Don't over-link. A project that already links
to a Priority through a related Topic doesn't need a redundant direct link to
the Priority.
