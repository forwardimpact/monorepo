# Pipeline Statuses

Step 3 of `req-track` uses these statuses. Default to `new` if you find no
advancement signals. Read the full thread chronologically. The most recent
signal wins.

## Statuses

| Status             | Signal                                                |
| ------------------ | ----------------------------------------------------- |
| `new`              | CV/profile received, no response yet                  |
| `screening`        | Under review, questions asked about the candidate     |
| `first-interview`  | First interview scheduled or completed                |
| `second-interview` | Second interview scheduled or completed               |
| `work-trial`       | Paid work trial or assessment project in progress     |
| `offer`            | Offer extended                                        |
| `hired`            | Accepted and onboarding                               |
| `rejected`         | Explicitly passed on ("not a fit", "pass", "decline") |
| `withdrawn`        | Candidate withdrew from the process                   |
| `on-hold`          | Paused, waiting on notice period, or deferred         |

## Advancement signals (hiring-manager replies)

- "let's schedule" / "set up an interview" → `first-interview`
- "second round" / "follow-up interview" → `second-interview`
- "work trial" / "assessment project" / "paid trial" → `work-trial`
- "not what we're looking for" / "pass" → `rejected`
- "candidate withdrew" / "no longer interested" / "accepted another offer" →
  `withdrawn`
- "extend an offer" / "make an offer" → `offer`
- "they've accepted" / "start date" → `hired`
- "put on hold" / "come back to later" → `on-hold`
- No response to profile → remains `new`
