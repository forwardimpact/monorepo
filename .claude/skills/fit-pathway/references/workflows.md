# Discovery Workflows

Common patterns for exploring the agent-aligned engineering standard using the
CLI. The CLI is data-driven — entity IDs depend on the YAML files in the active
data directory. Start with summary commands to discover what's available.

### Discover what roles exist on a track

```sh
# 1. See all tracks and which disciplines use them
npx fit-pathway track

# 2. See jobs filtered to a specific track
npx fit-pathway job --track=forward-deployed

# 3. List all job combinations on that track (for piping)
npx fit-pathway job --list --track=forward-deployed

# 4. View a specific role
npx fit-pathway job software-engineering J060 --track=forward-deployed
```

### Understand a discipline's structure

```sh
# 1. See all disciplines with their type (professional/management) and valid tracks
npx fit-pathway discipline

# 2. Drill into a discipline to see skill tiers and behaviour modifiers
npx fit-pathway discipline software-engineering

# 3. Compare the same discipline across tracks
npx fit-pathway job software-engineering J060 --track=platform
npx fit-pathway job software-engineering J060 --track=forward-deployed
```

### Explore career progression

```sh
# 1. See what changes between levels
npx fit-pathway progress software-engineering J060 --track=forward-deployed

# 2. Compare specific levels
npx fit-pathway progress software-engineering J060 --track=forward-deployed --compare=J100
```

### Discover what a track modifies

```sh
# 1. View track detail to see all skill and behaviour modifiers
npx fit-pathway track forward-deployed

# 2. Compare the resulting skill matrices side by side
npx fit-pathway job software-engineering J060 --skills
npx fit-pathway job software-engineering J060 --track=forward-deployed --skills
```
