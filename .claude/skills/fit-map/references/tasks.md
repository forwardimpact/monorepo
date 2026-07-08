# Schema Definitions and Common Tasks

## Schema Definitions

### JSON Schema (`@forwardimpact/libskill` `schema/json/`)

Validates YAML structure. One schema per entity type.

### RDF/SHACL (map's `schema/rdf/`)

Semantic representation for linked data interoperability.

**Schema synchronization:** When adding or modifying properties, update both
libskill's `schema/json/` and map's `schema/rdf/` in the same commit — the
sync crosses packages. The two formats must stay in sync.

---

## Common Tasks

### Add a Skill

1. Add skill to capability file:
   `data/pathway/capabilities/{capability_id}.yaml`
2. Add skill object with `id`, `name`, and `human:` section
3. Include level descriptions for all five proficiency levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions: `data/pathway/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npx fit-map validate`

### Add Interview Questions

Location:

- Skills: `data/pathway/questions/skills/{skill_id}.yaml`
- Behaviours: `data/pathway/questions/behaviours/{behaviour_id}.yaml`

Required properties:

| Property     | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Format: `{abbrev}_{level_abbrev}_{number}`     |
| `text`       | Question text (second person, under 150 chars) |
| `lookingFor` | 2-4 bullet points of good answer indicators    |

### Add Agent Skill Section

Add `agent:` section to skill in capability file:

```yaml
agent:
  name: skill-name-kebab-case
  description: Brief description
  useWhen: When agents should apply this skill
  stages:
    plan:
      focus: Planning objectives
      activities: [...]
      ready: [...]
    code:
      focus: Implementation objectives
      activities: [...]
      ready: [...]
```

### Add Tool Reference

Add `toolReferences:` to skill in capability file:

```yaml
toolReferences:
  - name: Langfuse
    url: https://langfuse.com/docs
    description: LLM observability platform
    useWhen: Instrumenting AI applications
```
