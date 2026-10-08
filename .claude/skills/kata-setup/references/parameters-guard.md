# Parameters: Guard Workflows and Variables

This reference is the one home of the watchdog and Dependabot defaults. It also
fixes their sheet rows and the variables rows. The Default cell kinds are those
of [`parameters-agents.md`](parameters-agents.md).

## `watchdog.yml`

| Parameter                   | Default                                                                                                                               | Home                                                                                   | Why                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| `{{WATCHDOG_THRESHOLD}}`    | `48`                                                                                                                                  | `watchdog.yml · env.WATCHDOG_THRESHOLD`                                                | Above two shifts' legitimate output       |
| `{{WATCHDOG_WINDOW_HOURS}}` | `8`                                                                                                                                   | `watchdog.yml · env.WATCHDOG_WINDOW_HOURS`                                             | Longer than the longest scheduled-run gap |
| `{{WATCHDOG_CRON}}`         | `*/5 * * * *`                                                                                                                         | `watchdog.yml · on.schedule`                                                           | Fallback tick for runner-token activity   |
| Event triggers              | `template`                                                                                                                            | `watchdog.yml · on`                                                                    | A tick lands when activity happens        |
| `{{DEFAULT_BRANCH}}`        | `derived:` `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`; when empty, `git symbolic-ref --short HEAD`; else `main` | `watchdog.yml · on.push.branches`, `on.pull_request_target.branches`, `default-branch` | The commits counter reads it              |
| Latch variable              | `template`                                                                                                                            | `watchdog.yml · killswitch-value`, `env.WATCHDOG_VARIABLE` (self-hosted)               | Every agent workflow gates on it          |
| Engage                      | `derived:` available self-hosted, unavailable hosted                                                                                  | `watchdog.yml · jobs.engage`                                                           | Engage mints its token from the App key   |
| `{{GEMBA_WATCHDOG_REF}}`    | `derived:` `action-refs.md`                                                                                                           | `watchdog.yml · uses`                                                                  | Immutable pin that Dependabot moves       |

In hosted mode the Engage Value reads "unavailable: the engage job needs the App
key".

## `dependabot.yml`

| Parameter                 | Default    | Home                                 | Why                           |
| ------------------------- | ---------- | ------------------------------------ | ----------------------------- |
| Ecosystem                 | `template` | `dependabot.yml · package-ecosystem` | Keeps the action pins current |
| `{{DEPENDABOT_INTERVAL}}` | `weekly`   | `dependabot.yml · schedule.interval` | One batch of pin bumps a week |

## Variables

| Parameter         | Default             | Home                         | Why                                      |
| ----------------- | ------------------- | ---------------------------- | ---------------------------------------- |
| `KATA_KILLSWITCH` | `read:`             | `variable · KATA_KILLSWITCH` | A setup write would silence the watchdog |
| `FIT_OIDC_URL`    | `read:` hosted only | `variable · FIT_OIDC_URL`    | The hosted token mint endpoint           |

The `KATA_KILLSWITCH` Value is `absent`, or the value and its timestamp, for
each scope that the verify step reads.
