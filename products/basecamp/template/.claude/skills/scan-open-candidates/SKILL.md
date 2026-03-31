---
name: scan-open-candidates
description: >
  Scan publicly available sources for candidates who indicate they are open for
  hire. Uses WebFetch to read public APIs (HN Algolia, GitHub, dev.to).
  Writes prospect notes to knowledge/Prospects/. Maintains
  cursor/dedup state in ~/.cache/fit/basecamp/head-hunter/. Use when the
  head-hunter agent is woken or when the user asks to scan for open candidates.
---

# Scan Open Candidates

Fetch and filter publicly available candidate posts from platforms where people
explicitly indicate they are open for hire. This skill handles the web fetching,
filtering, and deduplication logic.

## Trigger

Run this skill:

- When the head-hunter agent is woken by the scheduler
- When the user asks to scan for open candidates or prospects

## Prerequisites

- `WebFetch` tool available (Claude Code built-in — no curl/wget needed)
- `fit-pathway` CLI available (`bunx fit-pathway`)
- Memory directory at `~/.cache/fit/basecamp/head-hunter/`

## Inputs

- `~/.cache/fit/basecamp/head-hunter/cursor.tsv` — source rotation state
- `~/.cache/fit/basecamp/head-hunter/seen.tsv` — deduplication index
- Framework data via `bunx fit-pathway skill --list` and `bunx fit-pathway job`

## Outputs

- `knowledge/Prospects/{Name}.md` — prospect notes
- `~/.cache/fit/basecamp/head-hunter/cursor.tsv` — updated cursors
- `~/.cache/fit/basecamp/head-hunter/seen.tsv` — updated seen index
- `~/.cache/fit/basecamp/head-hunter/prospects.tsv` — updated prospect index
- `~/.cache/fit/basecamp/head-hunter/log.md` — appended activity log
- `~/.cache/fit/basecamp/state/head_hunter_triage.md` — triage report

---

## Source Definitions

### 1. Hacker News "Who Wants to Be Hired?"

A monthly thread where candidates self-post their availability. Posted on the
1st of each month on Hacker News.

**Find the thread:**

```
WebFetch URL: https://hn.algolia.com/api/v1/search?query=%22Who+wants+to+be+hired%22&tags=ask_hn&hitsPerPage=5
```

Parse the JSON response. The first hit with a title matching "Who wants to be
hired?" and `created_at` in the current or previous month is the target thread.

**Fetch candidate posts:**

```
WebFetch URL: https://hn.algolia.com/api/v1/items/{objectID}
```

The `children` array contains top-level comments — each is one candidate. Parse
the `text` field (HTML) for:

- **Location** — often first line: "Location: New York" or "NYC / Remote"
- **Remote** — "Remote: Yes" or "Open to remote"
- **Skills** — tech stack listings, language/framework mentions
- **Experience** — years, role titles, past companies
- **Contact** — email (often obfuscated: "name [at] domain [dot] com")
- **Resume/CV** — links to personal sites, GitHub, LinkedIn

**Cursor:** Store the `objectID` of the thread and the ID of the last processed
child comment.

**Rate limit:** HN Algolia API has no strict rate limit but be respectful — one
fetch per source per wake cycle.

### 2. GitHub Open to Work

Search for GitHub users whose bio signals availability. The GitHub user search
API returns candidates with bios, locations, and repository metadata.

**Search by location (rotate one query per wake):**

```
WebFetch URL: https://api.github.com/search/users?q=%22open+to+work%22+location:UK&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22open+to+work%22+location:Europe&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22looking+for+work%22+location:remote&per_page=30&sort=joined&order=desc
```

Alternative bio phrases to search (rotate across wakes):

- `"available for hire"`
- `"seeking opportunities"`
- `"seeking new role"`
- `"open to new opportunities"`
- `"currently exploring"`
- `"freelance" "available"`
- `"between roles"`
- `"on the market"`
- `"open to opportunities"`

Response has `total_count` and `items` array. Each item has `login`, `html_url`,
`score`.

**Fetch full profile for promising candidates:**

```
WebFetch URL: https://api.github.com/users/{login}
```

Profile fields:

- `name` — display name
- `bio` — bio text (contains open-to-work signals)
- `location` — geographic location
- `hireable` — boolean, explicit hire signal
- `blog` — personal site URL
- `company` — current employer (null = likely available)
- `public_repos` — repository count (technical depth indicator)
- `created_at` — account age (experience proxy)

**Cursor:** Store the location query last used and page number. Rotate: UK →
Europe → Remote → repeat.

**Rate limit:** 10 requests/minute unauthenticated. Fetch at most 5 full
profiles per wake cycle (1 search + 5 profile fetches = 6 requests).

### 3. dev.to

Developer articles where candidates signal availability via tags.

**Fetch articles tagged with job-seeking:**

```
WebFetch URL: https://dev.to/api/articles?tag=opentowork&per_page=25
WebFetch URL: https://dev.to/api/articles?tag=lookingforwork&per_page=25
```

For articles, parse `title`, `description`, `user.name`, `user.username`, `url`,
`tag_list`, `published_at`.

Skip articles older than 90 days — the candidate may no longer be looking.

Additional tags to try when primary tags yield no results:

- `jobsearch`
- `career`
- `hiring`
- `job`
- `remotework`

**Cursor:** Store the `id` of the most recent article processed.

**Rate limit:** dev.to API allows 30 requests per 30 seconds. One fetch per wake
is fine.

---

## Creative Fallback Strategies

When the primary query for a source yields zero new prospects after filtering,
try these alternative approaches before reporting an empty scan.

### Strategy 1: Alternative Search Terms

Each source has multiple query variations. If the first query returns nothing
new, try the next variation:

**HN:**

- Check the previous month's "Who Wants to Be Hired?" thread (candidates post
  late or threads stay active)
- Search for `"Who is hiring"` threads — candidates sometimes post in the wrong
  thread, and comments may link to candidate profiles
- Try:
  `https://hn.algolia.com/api/v1/search?query=%22freelancer+available%22&tags=comment`

**GitHub:**

- Search by skill + availability instead of just bio phrases:
  ```
  WebFetch URL: https://api.github.com/search/users?q=%22data+engineering%22+%22open+to+work%22&per_page=30&sort=joined&order=desc
  WebFetch URL: https://api.github.com/search/users?q=%22full+stack%22+%22available+for+hire%22&per_page=30&sort=joined&order=desc
  WebFetch URL: https://api.github.com/search/users?q=%22devops%22+%22looking+for%22&per_page=30&sort=joined&order=desc
  ```
- Search repos with README availability signals:
  ```
  WebFetch URL: https://api.github.com/search/repositories?q=%22hire+me%22+in:readme&sort=updated&order=desc&per_page=10
  ```
- Try different location terms: `Greece`, `Athens`, `Warsaw`, `Bucharest`,
  `Sofia`, `Manchester`, `Edinburgh`

**dev.to:**

- Try broader tags: `jobsearch`, `career`, `remotework`
- Search articles directly:
  ```
  WebFetch URL: https://dev.to/api/articles?tag=career&per_page=25
  ```
  Then filter article titles/descriptions for availability signals.

### Strategy 2: Relax Filters

If geographic filtering eliminated all candidates:

- Re-scan the same results without the location filter
- Candidates without stated locations may still be open to target regions
- Mark these as "location unconfirmed" in the prospect note

If skill alignment filtered everyone out:

- Lower the minimum bar from 2 framework skills to 1
- Look for transferable skills (e.g., strong Python → likely data integration
  capability)
- Consider adjacent skill indicators (e.g., "machine learning" implies data
  skills)

### Strategy 3: Cross-Reference

When a source yields very few results, cross-reference what you do find:

- If a GitHub profile links to a blog or portfolio, check it for more detail
  (via WebFetch) before deciding on skill fit
- If an HN post mentions a GitHub username, fetch their GitHub profile for
  richer signal

### Logging Alternatives

Log every alternative approach in `log.md`:

```markdown
## 2026-03-05 14:00

Source: github_open_to_work
Primary query: "open to work" location:UK — 30 results, 0 new after dedup
Alternative 1: "data engineering" "open to work" — 12 results, 1 new prospect
Alternative 2: "full stack" "available for hire" — 8 results, 0 new
Stopped after 2 alternatives (1 prospect found)
```

---

## Failure Handling

When a WebFetch fails (HTTP 4xx, 5xx, timeout, empty response, or redirect to a
block page), handle it gracefully:

1. **Record the failure** in `failures.tsv`:

   ```bash
   sed -i '' "s/^{source}\t.*/&/" ~/.cache/fit/basecamp/head-hunter/failures.tsv
   # Or increment the count and update last_error
   ```

2. **Do not retry** the same source in this wake cycle. Move on.

3. **Suspend after 3 consecutive failures.** During source selection, skip any
   source with count ≥ 3 in `failures.tsv`. The agent should still attempt
   suspended sources once every 7 days to detect recovery.

4. **Common failure patterns:**
   - **503 with HTML redirect** — Corporate proxy blocking the domain
     (social-networking category). Source will not recover without network
     change.
   - **403 Forbidden** — API requires authentication or blocks automated
     requests. Source may not recover.
   - **429 Too Many Requests** — Rate limited. Will recover. Don't suspend
     permanently.
   - **Empty response / timeout** — Transient. Will likely recover.

5. **Log all failures** in `log.md` with the HTTP status and error details.

6. **Reset on success.** When a previously-failing source succeeds, reset its
   count to 0 in `failures.tsv`.

## Filtering Pipeline

Apply these filters to each candidate post, in order:

### Filter 1: Open-for-Hire Signal

- HN "Who Wants to Be Hired?" — **auto-pass** (thread is explicitly opt-in)
- GitHub — must have `hireable: true`, or bio containing open-to-work phrases
- dev.to — must be tagged `opentowork` or `lookingforwork`

### Filter 2: Deduplication

```bash
grep -q "^{source}\t{post_id}\t" ~/.cache/fit/basecamp/head-hunter/seen.tsv
```

If found, skip. Otherwise continue.

### Filter 3: Geographic Fit

Look for location mentions. Prefer candidates in or open to:

- **US East Coast** (NYC, Boston, DC, Philadelphia, etc.)
- **UK** (London, Manchester, Edinburgh, etc.)
- **EU** — especially Greece, Poland, Romania, Bulgaria
- **Remote / Anywhere / Global**

Skip candidates explicitly locked to incompatible locations (e.g., "San
Francisco only", "APAC only"). When location is ambiguous or unstated, include
the candidate — let the user decide.

### Filter 4: Skill Alignment

Run `bunx fit-pathway skill --list` to get the framework skill inventory. Check
whether the candidate mentions skills that map to framework capabilities:

**Strong signals (forward-deployed track):**

- Multiple industries or domains in background
- Customer-facing project experience
- Data integration, analytics, visualization
- Full-stack development with business context
- Non-traditional path (law, policy, academia → tech)
- AI/ML tool proficiency (Claude, GPT, Cursor, "vibe coding")

**Strong signals (platform track):**

- Infrastructure, cloud platforms, DevOps
- Architecture and system design
- API design, shared services
- Performance, scalability, reliability

**Minimum bar:** At least 2 framework-relevant skills must be identifiable from
the post. Skip candidates with purely non-technical profiles.

### Filter 5: Experience Level

Estimate career level from signals:

| Signal                                      | Likely Level |
| ------------------------------------------- | ------------ |
| "junior", "entry-level", 0-2 years          | J040         |
| "mid-level", 3-5 years                      | J060         |
| "senior", 5-8 years, "lead"                 | J070         |
| "staff", "principal", 8+ years, "architect" | J090+        |

When uncertain, default to J060 with low confidence.

## Prospect Note Format

Write to `knowledge/Prospects/{Name}.md`:

```markdown
# {Name}

## Info
**Source:** [{platform}]({permalink})
**Date found:** {YYYY-MM-DD}
**Location:** {location or "Not specified"}
**Estimated level:** {J040–J110} (confidence: {high/medium/low})
**Best track fit:** {forward_deployed / platform / either}
**Match strength:** {strong / moderate}

## Profile
{2-4 sentences: who they are, what they do, why they match. Reference specific
framework skill IDs in parentheses where possible.}

## Framework Alignment
**Matching skills:** {comma-separated skill IDs}
**Key strengths:** {what stands out relative to the framework}
**Gaps:** {notable missing skills for the estimated role}

## Source Post
> {Brief excerpt or summary of the original post — 2-3 lines max}

## Notes
{Additional observations: polymath signals, AI tool usage, unusual background
combinations, anything noteworthy for the user}
```

**Naming:** Use the candidate's display name as given. If only a username is
available, use the username. Never fabricate real names.

## State Management Script

**Use the state script for ALL state file operations.** Do NOT write bespoke
scripts to update cursor, seen, prospects, failures, or log files.

    node .claude/skills/scan-open-candidates/scripts/state.mjs <command> [args]

### Commands

**Cursor** (source rotation):

```bash
# Check which source to scan next
node scripts/state.mjs cursor list

# Get cursor for a specific source
node scripts/state.mjs cursor get github_open_to_work

# Update cursor after scanning
node scripts/state.mjs cursor set github_open_to_work "2026-03-09T22:00:00Z" "UK-done_next:Europe"
```

**Seen** (deduplication):

```bash
# Check if a candidate was already seen (exit 0=seen, 1=new)
node scripts/state.mjs seen check github_open_to_work mxmxmx333

# Mark one ID as seen
node scripts/state.mjs seen add github_open_to_work mxmxmx333

# Mark multiple IDs as seen in one call
node scripts/state.mjs seen batch github_open_to_work id1 id2 id3 id4
```

**Prospects**:

```bash
# Add a new prospect
node scripts/state.mjs prospect add "Hasan Cam" github_open_to_work strong "J060-J070 platform"

# List recent prospects
node scripts/state.mjs prospect list --limit 10

# Count total prospects
node scripts/state.mjs prospect count
```

**Failures**:

```bash
# Check failure count (for source selection — skip if ≥3)
node scripts/state.mjs failure get mastodon_hachyderm

# Record a fetch failure
node scripts/state.mjs failure increment mastodon_hachyderm

# Reset after successful fetch
node scripts/state.mjs failure reset github_open_to_work
```

**Logging**:

```bash
# Append a formatted wake cycle entry
node scripts/state.mjs log-wake github_open_to_work "Primary query: 'open to work' location:UK — 30 results, 2 new prospects"

# Append raw text
node scripts/state.mjs log "Manual note about source rotation"
```

**Summary** (state overview):

```bash
node scripts/state.mjs summary
```

## Quality Checklist

- [ ] Selected the least-recently-checked source from cursor.tsv
- [ ] Fetched data using WebFetch (not curl/wget)
- [ ] Applied all 5 filters in order
- [ ] Checked seen.tsv before processing each post
- [ ] Used fit-pathway to benchmark each prospect against a real job
- [ ] Prospect notes follow the standard format
- [ ] Updated cursor.tsv with new position
- [ ] Appended all processed post IDs to seen.tsv
- [ ] Appended new prospects to prospects.tsv
- [ ] Appended wake summary to log.md
- [ ] Wrote triage report to state directory
