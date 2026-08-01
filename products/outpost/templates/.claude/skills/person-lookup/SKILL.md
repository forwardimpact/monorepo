---
name: person-lookup
description: Look up ANY person in the corporate directory from free-text input (an email address, or a first / last / full name) and return their record: real name, title, department, company, email, employee ID, office, and manager. Searches the Global Catalog forest-wide through LDAP. The bind uses the existing Kerberos ticket. Use when the user asks "who is X", needs someone's title / department / manager / email, or wants to disambiguate a name. For the *current* user's own identity, use the sibling `person-identify` skill instead.
---

# Person Lookup

Resolve **any** person in the corporate Active Directory from natural-language
input. The input is an email, a login, or any part of a name. This skill is the
sibling of `person-identify`, and it aims at *other* people. It searches the
**Global Catalog** (forest-wide). It handles multiple matches. It flags
external contacts and vendor accounts. Unlike `person-identify`, it never
writes the identity cache. It is a read-only, throwaway lookup.

## Trigger

- The user asks "who is <name>", or for someone's title, department, manager,
  email, or employee ID.
- A name is ambiguous, and you must disambiguate it against the directory.
- Another skill needs to resolve a person who is **not** the current user.

For the current user's own record, use `person-identify` instead. It also
populates the identity cache that other skills read.

## Prerequisites

- A valid **Kerberos ticket** (`klist` shows a principal). If absent, run
  `kinit <user>@<REALM>`.
- Network access to a domain controller (on-site or VPN).
- `ldapsearch` and `dig` — both ship with macOS. You install nothing.

Nothing is hardcoded. The script derives the realm and a domain controller at
runtime from the ticket and DNS. The bind uses SASL/GSSAPI against the existing
ticket. You never enter a password.

## Usage

```bash
bash .claude/skills/person-lookup/scripts/lookup.sh "Jane Doe"
bash .claude/skills/person-lookup/scripts/lookup.sh "jane.doe@example.com"
```

The argument is free text: an email, a full name, or just a surname.

## How it works

1. **Derive a domain controller** from the Kerberos principal's realm through
   DNS SRV (same bootstrap as `person-identify`).
2. **Search the Global Catalog** (`ldap://$dc:3268`, base `""`). The GC spans
   *every* domain in the forest. So you find a colleague in another region from
   your own ticket. A plain domain-scoped search would miss them. It also
   returns the common attributes (title, department, mail, manager), so one
   query is enough.
3. **Match with ANR** (Ambiguous Name Resolution). The `(anr=<input>)` filter
   matches an email, a login, or any name part in one shot. If ANR finds
   nothing, fall back to a substring search on `mail` / `displayName` /
   `proxyAddresses`.
4. **Resolve per match.** For a single hit, print the full record and resolve
   the `manager` DN to a name. For several hits, print a compact
   disambiguation list and suggest a narrower search by email.

## Output

| Field | Source attribute |
| --- | --- |
| Name | `displayName` (fallback `cn`) |
| Type | `objectClass` + OU — **Employee**, **Contact (external)**, or **User (external / vendor)** |
| Email | `mail` |
| Title | `title` |
| Department | `department` |
| Company | `company` |
| Employee ID | `employeeID` |
| Phone / Office | `telephoneNumber` / `physicalDeliveryOfficeName` |
| Manager | `manager` (DN → resolved to a name) |
| DN | distinguished name (region + OU, useful for disambiguation) |

## Notes

- **Multiple matches are normal.** A common name, or a person who also has an
  external **Contact** object (e.g. a vendor email alias), returns several
  entries. The **Type** column distinguishes an internal **Employee** from an
  external **Contact** (standard `objectClass=contact`). Some directories also
  park external/vendor *user* accounts under a dedicated OU. Set
  `VENDOR_OU_PATTERN` at the top of `scripts/lookup.sh` to your directory's OU
  substring (e.g. `OU=Contractors`). This flags those accounts too. It is empty
  by default, since the OU convention is organization-specific. Narrow with an
  email for an exact hit.
- **Silent partial results.** Under load the directory occasionally returns an
  entry's DN with no attributes (exit 0, no error). Every attribute fetch
  retries with backoff, so a throttled response never masquerades as a person
  with a blank title or email.
- **No cache.** This skill prints and exits. It never touches
  `~/.cache/fit/outpost/state/identity.md`. `person-identify` owns that file
  alone.
- **Ethics.** This reads objective, work-relevant directory data only, in line
  with the knowledge base's integrity rules. Never use it to build dossiers.
