---
name: person-identify
description: Look up the current user's identity (real name, company, job title, department, email, employee ID, and manager) from the corporate directory through LDAP. The bind uses the existing Kerberos ticket. Use to establish who the knowledge base belongs to, when CLAUDE.md needs the user's identity, or when the user asks "who am I" / for their own directory record. To look up someone *other* than the current user, use the sibling `person-lookup` skill instead.
---

# Person Identify

Resolve the current user's identity from the corporate Active Directory over
LDAP. This is the canonical way to establish **who the knowledge base belongs
to**. It replaces any static identity file. Results reflect the live
directory, so the skill picks up a job change or a reorg automatically.

## Trigger

- CLAUDE.md (or another skill) needs the current user's identity.
- The user asks "who am I", for their own directory record, or for their
  employee ID, title, department, or manager.

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

This prints the user's directory record, resolves the manager to a name, and
writes the result to the identity cache (below).

## Identity cache

The script writes `~/.cache/fit/outpost/state/identity.md`. That file is the
**canonical identity source** for the rest of the knowledge base. It replaces
the old static `USER.md`. It is auto-generated markdown with `Name`, `Email`,
and `Domain` fields (plus title, department, company, employee ID, office, and
manager):

```markdown
- **Name:** Jane Doe
- **Email:** jane.doe@example.com
- **Domain:** example.com
```

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
  "(sAMAccountName=$user)" displayName company title department employeeID mail manager
```

The `manager` attribute is a DN that may live in another domain. So the script
resolves it against the **Global Catalog** (port 3268). The Global Catalog is
forest-wide.

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

## Notes

- To look up **someone else**, use the sibling `person-lookup` skill. It takes
  free-text input (email or name). It searches the Global Catalog forest-wide
  (`ldap://$dc:3268 -b ''`). It handles multiple matches. It does **not** touch
  the identity cache.
- Active Directory is not required. The same `ldapsearch -Y GSSAPI` shape works
  against any Kerberos-backed LDAP directory. Only the attribute names differ.
