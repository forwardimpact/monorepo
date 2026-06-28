# Fallback Strategies

Reference for `req-scan` when a primary source query yields zero new prospects
after filtering. Try at most **3 alternatives per wake** to stay within rate
limits.

## Strategy 1 — alternative search terms

### HN

- Check the **previous** month's "Who Wants to Be Hired?" thread.
- Search for `"Who is hiring"` threads (candidates sometimes post in the wrong
  thread; comments may link to candidate profiles).
- Try
  `https://hn.algolia.com/api/v1/search?query=%22freelancer+available%22&tags=comment`.

### GitHub

Search by skill + availability:

```text
WebFetch URL: https://api.github.com/search/users?q=%22data+engineering%22+%22open+to+work%22&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22full+stack%22+%22available+for+hire%22&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22devops%22+%22looking+for%22&per_page=30&sort=joined&order=desc
```

Search repos with README signals:

```text
WebFetch URL: https://api.github.com/search/repositories?q=%22hire+me%22+in:readme&sort=updated&order=desc&per_page=10
```

Try alternate location terms: Greece, Athens, Warsaw, Bucharest, Sofia,
Manchester, Edinburgh.

### dev.to

Try broader tags: `jobsearch`, `career`, `remotework`, `job`, `hiring`. Or pull
from a tag and filter by title/description:

```text
WebFetch URL: https://dev.to/api/articles?tag=career&per_page=25
```

## Strategy 2 — relax filters

If geography eliminated everyone, re-scan without the location filter. Mark
unmatched-location prospects as "location unconfirmed" in the prospect note.

If skill alignment filtered everyone out: lower the bar from 2 standard skills
to 1; consider transferable skills (strong Python ⇒ likely data integration
capability); accept adjacent indicators ("machine learning" implies data
skills).

## Strategy 3 — cross-reference

When a source yields very few results, enrich what you do find:

- A GitHub profile that links to a blog/portfolio → WebFetch it for more detail
  before deciding skill fit.
- An HN post that mentions a GitHub username → fetch their GitHub profile for
  richer signal.

## Logging alternatives

Log every alternative in `log.md`:

```markdown
## 2026-03-05 14:00

Source: github_open_to_work
Primary query: "open to work" location:UK — 30 results, 0 new after dedup
Alternative 1: "data engineering" "open to work" — 12 results, 1 new prospect
Alternative 2: "full stack" "available for hire" — 8 results, 0 new
Stopped after 2 alternatives (1 prospect found)
```
