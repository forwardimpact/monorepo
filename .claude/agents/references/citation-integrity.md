# Citation integrity

Downstream agents read agent-authored bodies as evidence, so a cited SHA that
does not resolve on the repository it references propagates unchallenged. Before
an authoring path publishes a body on an in-scope surface — an Issue, PR, or
comment body, or wiki file content — it holds to three properties.

1. **Resolution against the referenced repository.** Every SHA-shaped token the
   body asserts as existing resolves on the repository its citation references.
   Context is per-citation: each token is judged against the repository its
   surrounding text names, so one body may cite two repositories. A token naming
   none is judged against the surface's host — the host repository for an Issue,
   PR, or comment; the wiki repository for wiki content. **Negative citations
   are exempt:** a token the body cites as non-resolving (a forensic correction,
   a quoted block record, an audit finding) need not resolve.
2. **No publish on failure, loud to the author.** A body with a failing token is
   not published; the block is surfaced to the agent to correct and republish.
   Silently dropping the body does not conform. On the wiki surface this binds
   authored landings (the content the path commits); session-sync working-tree
   publication is out of scope.
3. **Audit-readable block record.** Every block appends a record to the durable,
   non-rotating surface `wiki/citation-blocks.md` (kept distinct from rotating
   weekly logs so it survives the trial verdict), carrying at minimum the
   offending token, the repository checked, the originating authoring path
   (skill or profile routine), the blocked surface's identifier, the block time,
   and enough surrounding context to re-judge later.

**Resolution procedure.** For each existence-asserting token, infer the
referenced repository from context, then resolve via the host's commit-lookup
capability: for any hosted repository, `gh api repos/{owner}/{repo}/commits/{sha}`
(non-2xx is non-resolution); for wiki content, `git -C wiki cat-file -e
{sha}^{commit}` (non-zero exit is non-resolution). A token that fails to resolve
blocks the publish and emits the property-3 record; a token naming a repository
the installation cannot reach is recorded, not blocked. The commands illustrate
the capability; the SHA discriminator and the negative-citation marker are
authoring-path detail, not fixed here.
