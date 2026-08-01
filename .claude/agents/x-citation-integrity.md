# Citation integrity

Downstream agents read agent-authored bodies as evidence. So a cited SHA that
does not resolve on the repository it references propagates unchallenged. An
authoring path holds to three properties before it publishes a body on an
in-scope surface. The in-scope surfaces are an Issue, PR, or comment body, and
wiki file content.

1. **Resolution against the referenced repository.** Every SHA-shaped token the
   body asserts to exist resolves on the repository its citation references.
   Context is per-citation. Judge each token against the repository that the
   text around it names, so one body may cite two repositories. Judge a token
   that names none against the surface's host. The host is the host repository
   for an Issue, PR, or comment. For wiki content the host is the wiki
   repository. **Negative citations are exempt.** A token the body cites as one
   that does not resolve (a forensic correction, a quoted block record, an
   audit finding) need not resolve.
2. **No publish on failure, loud to the author.** The path does not publish a
   body with a token that fails. It surfaces the block to the agent, who
   corrects it and republishes. A silent drop of the body does not conform. On
   the wiki surface this binds authored landings (the content the path
   commits). Session-sync working-tree publication is out of scope.
3. **Audit-readable block record.** Every block appends a record to
   `wiki/citation-blocks.md`. That surface is durable and does not rotate. It
   stays distinct from the weekly logs that rotate, so it survives the trial
   verdict. The record carries at minimum the token at fault, the repository
   checked, and the authoring path that originated it (skill or profile
   routine). It also carries the identifier of the blocked surface, the block
   time, and enough context around it to re-judge later.

**Resolution procedure.** For each token that asserts existence, infer the
referenced repository from context. Then resolve it through the host's
commit-lookup capability. For any hosted repository, run
`gh api repos/{owner}/{repo}/commits/{sha}` (non-2xx is non-resolution). For
wiki content, run `git -C wiki cat-file -e {sha}^{commit}` (non-zero exit is
non-resolution). A token that fails to resolve blocks the publish and emits the
property-3 record. Record a token that names a repository the installation
cannot reach. Do not block it. The commands illustrate the capability. The SHA
discriminator and the negative-citation marker are authoring-path detail. This
reference does not fix them.
