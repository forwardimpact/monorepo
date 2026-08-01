# Filter Pipeline & Failure Handling

Reference for `req-scan` Steps 3 (filter) and 5 (failure handling).

## Filter pipeline

Apply in order. Stop at the first that excludes the candidate.

### 1. Open-for-hire signal

- HN "Who Wants to Be Hired?" → **auto-pass** (thread is opt-in).
- GitHub → must have `hireable: true` **or** bio contains an open-to-work
  phrase.
- dev.to → the post must carry the tag `opentowork` or `lookingforwork`.

### 2. Deduplication

```bash
node scripts/state.mjs seen check {source} {post_id}
```

If exit 0 (seen), skip. Otherwise continue.

### 3. Geographic fit

Prefer or accept candidates in or open to:

- **US East Coast** (NYC, Boston, DC, Philadelphia, …).
- **UK** (London, Manchester, Edinburgh, …).
- **EU** — especially Greece, Poland, Romania, Bulgaria.
- **Remote / Anywhere / Global**.

Skip candidates explicitly locked to incompatible regions ("San Francisco only",
"APAC only"). When location is ambiguous or unstated, include the candidate.
Let the user decide.

### 4. Skill alignment

`bunx fit-pathway skill --list` for the standard inventory. Strong signals:

**Forward Deployed:** multiple industries / domains, customer-facing projects,
data integration / analytics / visualization, full-stack with business context,
non-traditional path (law, policy, academia → tech), AI/ML tool proficiency
(Claude, GPT, Cursor, "vibe coding").

**Platform:** infrastructure / cloud / DevOps, architecture and system design,
API design and shared services, performance / scalability / reliability.

**Minimum bar:** the post must show at least 2 standard-relevant skills. Skip
candidates with purely non-technical profiles.

### 5. Experience level

| Signal                                      | Likely level |
| ------------------------------------------- | ------------ |
| "junior", "entry-level", 0–2 years          | J040         |
| "mid-level", 3–5 years                      | J060         |
| "senior", 5–8 years, "lead"                 | J070         |
| "staff", "principal", 8+ years, "architect" | J090+        |

When uncertain, default to J060 with low confidence.

## Failure handling

When a WebFetch fails (HTTP 4xx, 5xx, timeout, empty response, redirect to a
block page):

1. Increment the failure count:
   `node scripts/state.mjs failure increment {source}`.
2. **Do not retry** the same source in this wake cycle.
3. Suspend after 3 consecutive failures. Skip a suspended source during source
   selection. Retry suspended sources once every 7 days to detect recovery.
4. Log the failure in `log.md` with HTTP status and error.
5. Reset on success: `node scripts/state.mjs failure reset {source}`.

### Common failure patterns

| Symptom                  | Likely cause                                             |
| ------------------------ | -------------------------------------------------------- |
| 503 with HTML redirect   | A corporate proxy blocks the domain. It will not recover |
| 403 Forbidden            | The site needs auth, or it blocks automated requests     |
| 429 Too Many Requests    | Rate limited. It recovers. Do not suspend permanently    |
| Empty response / timeout | Transient. It likely recovers next wake                  |
