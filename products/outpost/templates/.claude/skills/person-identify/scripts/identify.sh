#!/usr/bin/env bash
# Identify the current user from the corporate directory (Active Directory over LDAP).
# Cache the result at ~/.cache/fit/outpost/state/identity.md for other skills.
#
# The script is generic. Nothing is hardcoded. It derives the user, the realm,
# and the base DN from the existing Kerberos ticket. It finds the domain
# controller with DNS SRV records. It works for any AD domain, on or off VPN.
# It needs a Kerberos ticket and a reachable DC.
#
# Auth uses SASL/GSSAPI against the existing ticket. You never enter a password.
set -u

CACHE="$HOME/.cache/fit/outpost/state/identity.md"

# Org-specific: substring of the DN's OU under which offboarded/deprovisioned
# accounts are parked. AD keeps the `manager` edge on such accounts when they
# are moved here at offboarding, so the user's `directReports` back-link still
# counts them — surfacing ex-reports as phantom team members. Reports whose DN
# matches this pattern are dropped. Set to your directory's convention (empty
# disables the OU filter; disabled-account filtering via userAccountControl
# still applies). `OU=Obsolete` is a common AD default.
INACTIVE_OU_PATTERN="OU=Obsolete"

# 1. Take the user principal from the Kerberos ticket: USER@REALM.EXAMPLE.COM
princ=$(klist 2>/dev/null | sed -n 's/.*[Pp]rincipal: *//p' | head -1)
if [ -z "$princ" ]; then
  echo "No Kerberos ticket found. Get one first, e.g.:  kinit <user>@<REALM>" >&2
  exit 1
fi
user=${princ%@*}
realm=${princ#*@}

# 2. Realm -> LDAP base DN (REALM.EXAMPLE.COM -> DC=REALM,DC=EXAMPLE,DC=COM)
base=$(printf '%s' "$realm" | awk -F. '{for(i=1;i<=NF;i++) printf "%sDC=%s",(i>1?",":""),$i}')
dom=$(printf '%s' "$realm" | tr '[:upper:]' '[:lower:]')

# 3. Find a reachable domain controller with DNS SRV (msdcs first, then plain ldap)
dc=$(dig +short SRV "_ldap._tcp.dc._msdcs.$dom" | awk 'NR==1{print $4}' | sed 's/\.$//')
[ -z "$dc" ] && dc=$(dig +short SRV "_ldap._tcp.$dom" | awk 'NR==1{print $4}' | sed 's/\.$//')
if [ -z "$dc" ]; then
  echo "Could not find a domain controller for $dom with DNS SRV." >&2
  exit 1
fi

# 4. Look up the current user's record (GSSAPI = use the existing ticket, no password)
attrs="displayName givenName sn company title department employeeID mail telephoneNumber physicalDeliveryOfficeName manager directReports"
rec=$(ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "ldap://$dc" -b "$base" "(sAMAccountName=$user)" $attrs 2>/dev/null)
if [ -z "$rec" ]; then
  echo "No directory record found for '$user' under $base on $dc." >&2
  exit 1
fi

# Pull a single attribute value out of the LDIF record. Decode the base64
# `attr:: <b64>` form that LDIF uses for any non-ASCII value (accented names,
# and DNs whose CN is accented — e.g. the manager attribute).
field() { # $1=attr
  local attr="$1" line
  line=$(printf '%s\n' "$rec" | grep -m1 -E "^$attr:: ?|^$attr: ")
  case "$line" in
    "$attr:: "*) printf '%s' "${line#"$attr":: }" | base64 -D 2>/dev/null ;;
    "$attr: "*)  printf '%s' "${line#"$attr": }" ;;
  esac
}

disp=$(field displayName); gn=$(field givenName); sn=$(field sn)
company=$(field company); title=$(field title); dept=$(field department)
empid=$(field employeeID); mail=$(field mail)
office=$(field physicalDeliveryOfficeName)

# Real name from given+surname. Fall back to displayName. Domain from the email.
name="$gn $sn"; name=$(printf '%s' "$name" | sed 's/^ *//;s/ *$//')
[ -z "$name" ] && name="$disp"
domain=$(printf '%s' "$mail" | sed 's/.*@//' | tr '[:upper:]' '[:lower:]')

# 5. Resolve the user's org edges — the manager (up) and the direct reports
#    (down) — to names. Both are DNs that may live in another domain, so
#    resolve against the Global Catalog (port 3268). It is forest-wide.
gc="ldap://$dc:3268"

# One shared DN -> displayName resolver. Decodes the base64 `displayName:: <b64>`
# form (accented names are encoded that way) and retries past the directory's
# occasional attribute-less response under load, mirroring person-lookup.
dn_name() { # $1=DN  -> displayName ("" if unresolvable)
  local dn="$1" line tries=0
  [ -z "$dn" ] && return 0
  while [ "$tries" -lt 4 ]; do
    line=$(ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "$gc" -b "$dn" -s base \
             displayName 2>/dev/null | grep -m1 -E '^displayName:: ?|^displayName: ')
    case "$line" in
      "displayName:: "*) printf '%s' "${line#displayName:: }" | base64 -D 2>/dev/null; return 0 ;;
      "displayName: "*)  printf '%s' "${line#displayName: }"; return 0 ;;
    esac
    tries=$((tries + 1)); sleep "$tries"
  done
}

# Resolve a direct-report DN to a name, but ONLY if the account is still active.
# A report is inactive — and therefore dropped from the team roster — when either:
#   1. its DN sits under the obsolete/deprovisioned OU ($INACTIVE_OU_PATTERN), or
#   2. its account is disabled in AD (userAccountControl bit 0x2, ACCOUNTDISABLE).
# Offboarding leaves the `manager` edge dangling, so without this filter ex-reports
# linger in the roster forever. Fetches displayName + userAccountControl together,
# reusing dn_name's base64 decode and retry-under-load behaviour. Prints the name,
# or nothing to skip the report.
dn_report() { # $1=DN -> displayName if active, else ""
  local dn="$1" out line uac tries=0
  [ -z "$dn" ] && return 0
  # (1) Obsolete-OU filter — case-insensitive substring match on the DN.
  if [ -n "$INACTIVE_OU_PATTERN" ]; then
    if printf '%s' "$dn" | grep -qiF "$INACTIVE_OU_PATTERN"; then return 0; fi
  fi
  while [ "$tries" -lt 4 ]; do
    out=$(ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "$gc" -b "$dn" -s base \
            displayName userAccountControl 2>/dev/null)
    line=$(printf '%s\n' "$out" | grep -m1 -E '^displayName:: ?|^displayName: ')
    if [ -n "$line" ]; then
      # (2) Disabled-account filter. userAccountControl is a GC-replicated
      # attribute; if absent (older DC / partial reply) we simply don't filter.
      uac=$(printf '%s\n' "$out" | sed -n 's/^userAccountControl: *//p' | head -1)
      case "$uac" in
        ''|*[!0-9]*) : ;;                          # missing/non-numeric -> can't judge
        *) [ $((uac & 2)) -ne 0 ] && return 0 ;;   # ACCOUNTDISABLE set -> skip
      esac
      case "$line" in
        "displayName:: "*) printf '%s' "${line#displayName:: }" | base64 -D 2>/dev/null; return 0 ;;
        "displayName: "*)  printf '%s' "${line#displayName: }"; return 0 ;;
      esac
    fi
    tries=$((tries + 1)); sleep "$tries"
  done
}

# Up-edge: the manager (single-valued DN on the user's own record).
mgr_name=$(dn_name "$(field manager)")

# Down-edges: direct reports — a multi-valued back-link on the user's OWN record.
# field() keeps only the first value, so pull EVERY value: emit one report DN per
# line (decoding the base64 `directReports:: <b64>` form), resolve each to a name
# via dn_report (which drops offboarded/disabled accounts), and sort for stable,
# diff-friendly cache output. Kept in a function because a `case` inside `$(...)`
# trips the bash 3.2 parser that macOS ships.
resolve_reports() {
  printf '%s\n' "$rec" | while IFS= read -r line; do
    case "$line" in
      "directReports:: "*) printf '%s' "${line#directReports:: }" | base64 -D 2>/dev/null; echo ;;
      "directReports: "*)  printf '%s\n' "${line#directReports: }" ;;
    esac
  done | while IFS= read -r dn; do
    [ -n "$dn" ] || continue
    n=$(dn_report "$dn"); [ -n "$n" ] && printf '%s\n' "$n"
  done | sort
}
reports=$(resolve_reports)

# 6. Write the cache. It keeps the Name/Email/Domain shape other skills already
#    parse, plus extra fields. The script generates it. Never edit it by hand.
mkdir -p "$(dirname "$CACHE")"
{
  echo "# User Identity"
  echo
  echo "The \`person-identify\` skill generates this file from the corporate directory."
  echo "Do not edit it by hand. Run the skill again to refresh it."
  echo
  echo "- **Name:** $name"
  echo "- **Email:** $mail"
  echo "- **Domain:** $domain"
  echo "- **Title:** $title"
  echo "- **Department:** $dept"
  echo "- **Company:** $company"
  echo "- **Employee ID:** $empid"
  echo "- **Office:** $office"
  [ -n "$mgr_name" ] && echo "- **Manager:** $mgr_name"
  # Always emit Direct reports so the "our team" rule in CLAUDE.md can branch
  # explicitly: a list => the user manages people (the team is in this cache);
  # `none` => an individual contributor (peers resolved on demand from the
  # manager). An omitted line would be indistinguishable from "not yet resolved".
  if [ -n "$reports" ]; then
    echo "- **Direct reports:**"
    printf '%s\n' "$reports" | while IFS= read -r r; do echo "    - $r"; done
  else
    echo "- **Direct reports:** none"
  fi
} > "$CACHE"

# 7. Show the result.
cat "$CACHE"
echo
echo "(cached at $CACHE)"
