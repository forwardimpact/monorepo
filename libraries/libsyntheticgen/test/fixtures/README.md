# Activity test fixtures

## `mini-terrain.fixture.js`

Shared `MINI_TERRAIN` DSL string used by `activity.test.js`,
`prose-activity.test.js`, and `file-path-parity.test.js`. Two scenarios
hit team alpha (declining on `deep_work` and `ease_of_release`) and team
beta (rising on `learning_culture` and `connectedness`). The seed is
`42`; generation is reproducible across Node and Bun.

## `file-path-baseline.json`

Sorted JSON array of every storage path produced by
`renderRawDocuments(entities, undefined)` for the `MINI_TERRAIN` fixture.
The post-refactor parity test (`file-path-parity.test.js`) reads this
baseline and asserts the new pipeline reproduces the same path set.

File **contents** are expected to change (the prose-bearing activity
contract reshapes how `commentKeys` and `webhookKeys` get rendered into
the comment/webhook outputs); only the **set of paths** is asserted.

### When to regenerate

Regenerate the baseline only when the fixture itself changes. **Do not**
silently regenerate it after a refactor — a refactor that changes the
file path set is a regression unless the spec explicitly authorizes it.

### How to regenerate

Run from the monorepo root, on a clean tree where
`generateActivity` + `renderRawDocuments` already produce the desired
path set:

```bash
node --input-type=module -e "
  import('./libraries/libsyntheticgen/test/fixtures/mini-terrain.fixture.js').then(async ({ MINI_TERRAIN }) => {
    const { tokenize } = await import('./libraries/libsyntheticgen/src/dsl/tokenizer.js');
    const { parse } = await import('./libraries/libsyntheticgen/src/dsl/parser.js');
    const { createSeededRNG } = await import('./libraries/libsyntheticgen/src/engine/rng.js');
    const { buildEntities } = await import('./libraries/libsyntheticgen/src/engine/entities.js');
    const { generateActivity } = await import('./libraries/libsyntheticgen/src/engine/activity.js');
    const { renderRawDocuments } = await import('./libraries/libsyntheticrender/src/render/raw.js');
    const ast = parse(tokenize(MINI_TERRAIN));
    const rng = createSeededRNG(ast.seed);
    const entities = buildEntities(ast, rng);
    entities.activity = generateActivity(ast, rng, entities.people, entities.teams);
    const files = renderRawDocuments(entities, undefined);
    console.log(JSON.stringify(Array.from(files.keys()).sort(), null, 2));
  });
" > libraries/libsyntheticgen/test/fixtures/file-path-baseline.json
```

This is the same script body the parity test invokes — captured once,
asserted on every run.
