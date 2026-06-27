# CLI Reference

## Organization and People

```sh
npx fit-landmark org show                     # Organization directory
npx fit-landmark org team                     # Team views
```

### GetDX Snapshots

```sh
npx fit-landmark snapshot list                # List available snapshots
npx fit-landmark snapshot show <id>           # Snapshot detail
npx fit-landmark snapshot trend               # Score trends over time
npx fit-landmark snapshot compare             # Factor comparison across snapshots
```

### Evidence and Markers

```sh
npx fit-landmark evidence                     # Marker-linked evidence with rationale
npx fit-landmark marker <skill>               # Marker definitions reference view
npx fit-landmark coverage --email <email>     # Evidence coverage metrics
npx fit-landmark practiced --manager <email>  # Evidenced vs derived capability
```

### Individual Growth

```sh
npx fit-landmark readiness --email <email>    # Promotion readiness checklist
npx fit-landmark timeline --email <email>     # Individual growth timeline by quarter
```

### Team Health

```sh
npx fit-landmark health                       # Team health overview
npx fit-landmark health --manager <email>     # Health for a specific manager's reports
npx fit-landmark voice --manager <email>      # Engineer voice from GetDX comments
npx fit-landmark voice --email <email>        # Individual voice
```
