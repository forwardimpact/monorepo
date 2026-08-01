# Common Workflows

## "What happens if Alice leaves?"

```sh
npx fit-summit risks platform
npx fit-summit what-if platform --remove 'Alice'
```

Compare the risk lists before and after to see which single points of failure
emerge.

### "Should we hire a senior or a mid-level?"

```sh
npx fit-summit what-if platform --add '{ discipline: software-engineering, level: J060 }'
npx fit-summit what-if platform --add '{ discipline: software-engineering, level: J040 }'
```

Compare the coverage diff from each scenario to see which addresses more gaps.

### "Where should this engineer focus their growth?"

```sh
npx fit-summit growth platform --evidenced --outcomes
```

The command returns recommendations ranked by team impact, filtered by what the
engineer already demonstrated, and weighted by organizational driver scores.

### "How has the team changed over time?"

```sh
npx fit-summit trajectory platform --quarters 8
```

The command shows quarterly coverage snapshots with per-skill trend
classification and roster changes (joins, leaves, promotions).
