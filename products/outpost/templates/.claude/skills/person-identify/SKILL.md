---
name: person-identify
description: Look up the current user's identity (real name, company, job title, department, email, employee ID, manager, and direct reports) from the corporate directory through LDAP. The bind uses the existing Kerberos ticket. Captures the user's org edges — manager and direct reports — so the KB can resolve who "our team" is. Use to establish who the knowledge base belongs to, when CLAUDE.md needs the user's identity, or when the user asks "who am I" / for their own directory record. To look up someone *other* than the current user, use the sibling `person-lookup` skill instead.
---

# Person Identify

Resolve the current user's identity from the corporate Active Directory over
LDAP. This is the canonical way to establish **who the knowledge base belongs
to**. It replaces any static identity file. Results reflect the live
directory, so the skill picks up a job change or a reorg automatically.

## Trigger

- CLAUDE.md (or another skill) needs the current user's identity, or needs to
  resolve who "our team" is.
- The user asks "who am I", for their own directory record, or for their
  employee ID, title, department, manager, or direct reports.

## Prerequisites

- A valid **Kerberos ticket** for the user (`klist` shows a principal).
  If absent, get one with `kinit <user>@<REALM>`.
- Network access to a domain controller (on-site or through VPN).
- `ldapsearch` and `dig` — both ship with macOS. You install nothing.

Nothing is hardcoded. The script derives the username, realm, base DN, and
domain controller at runtime from the ticket and DNS. You never enter a
password. The bind uses SASL/GSSAPI against the existing ticket.

## Usage

```bash
bash .claude/skills/person-identify/scripts/identify.sh
```

This prints the user's directory record, resolves the manager and each direct
report to a name, and writes the result to the identity cache (below).

## Identity cache

The script writes `~/.cache/fit/outpost/state/identity.md`. That file is the
**canonical identity source** for the rest of the knowledge base. It replaces
the old static `USER.md`. It is auto-generated markdown with `Name`, `Email`,
and `Domain` fields (plus title, department, company, employee ID, office, and
the user's two org edges — `Manager` and `Direct reports`):

```markdown
- **Name:** Jane Doe
- **Email:** jane.doe@example.com
- **Domain:** example.com
- **Manager:** Roe, Richard
- **Direct reports:**
    - Chen, Sarah
    - Okafor, Ada
```

The **Manager** and **Direct reports** edges let the KB resolve who "our team"
is — see the `## User Identity & Team` section of `CLAUDE.md` for the rule.
`Direct reports` is always written: a list when the user manages people, or
the explicit sentinel `- **Direct reports:** none` for an individual
contributor. Reports are name-sorted so re-runs of the synced cache diff
cleanly.

Other skills (e.g. `extract-entities`, `anarlog-process`, `req-track`,
`req-workday`, `candidate-report`, `sync-teams`) read this file for the user's
name/email/domain. They use it for self-exclusion and author attribution. They
run this skill first if the cache is missing or stale. Never hand-edit the
cache. Run the skill again to refresh it.

## How it works

The script is a handful of generic one-liners:

```bash
# 1. Identity from the Kerberos ticket: USER@REALM.EXAMPLE.COM
princ=$(klist 2>/dev/null | sed -n 's/.*[Pp]rincipal: *//p' | head -1)
user=${princ%@*}; realm=${princ#*@}

# 2. Realm -> base DN (REALM.EXAMPLE.COM -> DC=REALM,DC=EXAMPLE,DC=COM)
base=$(printf '%s' "$realm" | awk -F. '{for(i=1;i<=NF;i++) printf "%sDC=%s",(i>1?",":""),$i}')
dom=$(printf '%s' "$realm" | tr '[:upper:]' '[:lower:]')

# 3. Find a domain controller via DNS SRV (any AD domain)
dc=$(dig +short SRV "_ldap._tcp.dc._msdcs.$dom" | awk 'NR==1{print $4}' | sed 's/\.$//')

# 4. Look up the current user (GSSAPI = existing ticket, no password)
ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "ldap://$dc" -b "$base" \
  "(sAMAccountName=$user)" displayName company title department employeeID mail \
  manager directReports
```

Both org edges come back as DNs that may live in another domain. So the script
resolves them against the **Global Catalog** (port 3268, forest-wide) through
one shared `dn_name` helper. `manager` is single-valued. `directReports` is
the multi-valued back-link of the same edge, so the script pulls every value
(not just the first), resolves each to a name, and sorts the list. The
resolver decodes the base64 `displayName:: …` form (used for accented names)
and retries past the directory's occasional attribute-less response under
load.

**Inactive reports are filtered from the roster.** AD does not clear the
`manager` edge when an account is offboarded — it just moves the account to a
deprovisioned OU — so the user's `directReports` back-link keeps counting
ex-reports as phantom team members. Reports resolve through `dn_report`, which
drops a DN when either (1) it sits under the obsolete OU
(`INACTIVE_OU_PATTERN`, a config knob at the top of the script; `OU=Obsolete`
by default, empty to disable), or (2) the account is disabled in AD —
`userAccountControl` bit `0x2` (`ACCOUNTDISABLE`), fetched in the same GC
query as the name. The manager edge stays unfiltered: a disabled manager is a
signal worth surfacing, not hiding.

## Output

Key attributes returned (names per Active Directory schema):

| Attribute                   | Meaning                 |
| --------------------------- | ----------------------- |
| `displayName` / `givenName` / `sn` | Real name        |
| `company`                   | Company                 |
| `title`                     | Job title               |
| `department`                | Department              |
| `employeeID`                | Employee ID             |
| `mail`                      | Email address           |
| `physicalDeliveryOfficeName`| Office / location       |
| `manager`                   | Manager (DN → resolved to name) |
| `directReports`             | Direct reports (multi-valued DN back-link → each resolved to a name; offboarded/disabled accounts filtered out) |
| `userAccountControl`        | Fetched per report to drop disabled accounts (bit `0x2`) |

## Notes

- To look up **someone else**, use the sibling `person-lookup` skill. It takes
  free-text input (email or name). It searches the Global Catalog forest-wide
  (`ldap://$dc:3268 -b ''`). It handles multiple matches. It does **not** touch
  the identity cache.
- `directReports` is the back-link stored on the user's own home-domain
  record, so a report whose account lives in *another* forest domain may be
  omitted. For a single-domain manager (the common case) it is complete. If
  cross-domain reports matter, swap it for a forest-wide reverse search over
  the GC — `(manager=<userDN>)`, where the user's DN is the `dn:` line of the
  fetched record — feeding the same `dn_report` resolver.
- **Offboarded reports linger in AD.** The `directReports` back-link keeps
  counting a report after they leave, because offboarding moves the account to
  a deprovisioned OU without clearing its `manager` edge. `dn_report` filters
  these out (obsolete-OU DN, or a disabled `userAccountControl`). Tune
  `INACTIVE_OU_PATTERN` at the top of `scripts/identify.sh` to your
  directory's convention — it mirrors `person-lookup`'s `VENDOR_OU_PATTERN`
  knob. The real fix is upstream (clear the manager edge at offboarding); the
  filter shields the KB until then.
- Active Directory is not required. The same `ldapsearch -Y GSSAPI` shape works
  against any Kerberos-backed LDAP directory. Only the attribute names differ.
