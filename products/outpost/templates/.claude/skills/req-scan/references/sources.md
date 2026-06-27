# Sources

Reference for `req-scan` Step 2 (fetch & scan). One source per wake cycle.

## 1. Hacker News "Who Wants to Be Hired?"

Monthly thread, posted on the 1st.

```text
WebFetch URL: https://hn.algolia.com/api/v1/search?query=%22Who+wants+to+be+hired%22&tags=ask_hn&hitsPerPage=5
```

The first hit whose title matches "Who wants to be hired?" with `created_at` in
the current or previous month is the target thread.

```text
WebFetch URL: https://hn.algolia.com/api/v1/items/{objectID}
```

`children[]` contains top-level comments — each is one candidate. Parse the
`text` field for:

- **Location** ("Location: New York", "NYC / Remote").
- **Remote** ("Remote: Yes", "Open to remote").
- **Skills** — tech stack, language/standard mentions.
- **Experience** — years, role titles, past companies.
- **Contact** — email (often obfuscated: "name [at] domain [dot] com").
- **Resume / CV** — links to personal sites, GitHub, LinkedIn.

**Cursor:** thread `objectID` plus the ID of the last processed child comment.
**Rate:** no strict limit; one fetch per wake cycle.

## 2. GitHub Open to Work

Search by location (rotate one query per wake):

```text
WebFetch URL: https://api.github.com/search/users?q=%22open+to+work%22+location:UK&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22open+to+work%22+location:Europe&per_page=30&sort=joined&order=desc
WebFetch URL: https://api.github.com/search/users?q=%22looking+for+work%22+location:remote&per_page=30&sort=joined&order=desc
```

Alternate bio phrases to rotate across wakes: `"available for hire"`,
`"seeking opportunities"`, `"seeking new role"`, `"open to new opportunities"`,
`"currently exploring"`, `"freelance" "available"`, `"between roles"`,
`"on the market"`, `"open to opportunities"`.

Fetch each promising candidate's full profile:

```text
WebFetch URL: https://api.github.com/users/{login}
```

Profile fields: `name`, `bio`, `location`, `hireable`, `blog`, `company` (null =
likely available), `public_repos`, `created_at`.

**Cursor:** location query last used + page number. Rotate UK → Europe → Remote
→ repeat. **Rate:** 10 requests/min unauthenticated. Fetch at most 5 full
profiles per wake (1 search + 5 profile fetches = 6 requests).

## 3. dev.to

```text
WebFetch URL: https://dev.to/api/articles?tag=opentowork&per_page=25
WebFetch URL: https://dev.to/api/articles?tag=lookingforwork&per_page=25
```

Fields: `title`, `description`, `user.name`, `user.username`, `url`, `tag_list`,
`published_at`. Skip articles older than 90 days.

**Cursor:** `id` of the most recent article processed. **Rate:** 30 req per 30
s. One fetch per wake.

## Use WebFetch only

**Never use `curl` or `wget`.** WebFetch is the supported transport.
