# Schedule Templates

One `agent-shift.yml` runs the whole roster each shift, in declaration order,
serialized by `max-parallel: 1`. Order the matrix as a producer → reviewer →
shipper chain so each agent acts on the previous one's output:

1. **product-manager** — triages a fresh backlog
2. **engineering agent** — implements from the backlog (default profile:
   `staff-engineer`)
3. **security-engineer** — reviews code
4. **technical-writer** — reviews docs
5. **release-engineer** — ships what passed review
6. **improvement-coach** — assesses team improvement

Because the matrix serializes the roster, the schedule is **three shift-start
crons** (night, day, swing) — not a per-agent stagger. The storyboard runs once
daily, after the night shift finishes.

## `{{SHIFT_CRONS}}` by Timezone

All crons are UTC. Local times use the tighter summer offset. Shifts start at
roughly 03:00 (night), 12:00 (day), and 20:00 (swing) local.

### Europe/Paris (CEST UTC+2 / CET UTC+1)

```yaml
    - cron: "0 1 * * *"   # 03:00 night
    - cron: "0 10 * * *"  # 12:00 day
    - cron: "0 18 * * *"  # 20:00 swing
```

Storyboard: `0 6 * * *` (08:00 local).

### US East / New York (EDT UTC-4 / EST UTC-5)

```yaml
    - cron: "0 7 * * *"   # 03:00 night
    - cron: "0 16 * * *"  # 12:00 day
    - cron: "0 0 * * *"   # 20:00 swing
```

Storyboard: `0 12 * * *` (08:00 local).

### US West / Los Angeles (PDT UTC-7 / PST UTC-8)

```yaml
    - cron: "0 10 * * *"  # 03:00 night
    - cron: "0 19 * * *"  # 12:00 day
    - cron: "0 3 * * *"   # 20:00 swing
```

Storyboard: `0 15 * * *` (08:00 local).

### Asia Pacific / Tokyo (JST UTC+9)

```yaml
    - cron: "0 18 * * *"  # 03:00 night
    - cron: "0 3 * * *"   # 12:00 day
    - cron: "0 11 * * *"  # 20:00 swing
```

Storyboard: `0 23 * * *` (08:00 local).

### Asia Pacific / Sydney (AEST UTC+10 / AEDT UTC+11)

```yaml
    - cron: "0 17 * * *"  # 03:00 night
    - cron: "0 2 * * *"   # 12:00 day
    - cron: "0 10 * * *"  # 20:00 swing
```

Storyboard: `0 22 * * *` (08:00 local).
