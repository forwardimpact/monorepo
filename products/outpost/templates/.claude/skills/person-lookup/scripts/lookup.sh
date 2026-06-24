#!/usr/bin/env bash
# person-lookup: resolve ANY person in the corporate directory from free-text
# input (an email address, or a first / last / full name) and print their
# directory record(s).
#
# Sibling to `person-identify`, but for *other* people, not the current user:
#   - Searches the Global Catalog (port 3268, base "") so it reaches EVERY
#     domain in the forest from a single ticket — colleagues in other regions
#     are found, not just your own domain.
#   - Uses Active Directory ANR (Ambiguous Name Resolution), so one filter
#     matches an email, a login, or any part of a name.
#   - Handles 0, 1, or many matches, and flags external Contacts / vendor
#     accounts so an internal employee is never confused with an outside one.
#   - NEVER writes the identity cache — this is a throwaway lookup.
#
# Auth uses SASL/GSSAPI against the existing Kerberos ticket — no password.
#
# Robustness note: under load the directory intermittently returns an entry's
# DN with NO attributes (exit 0, no error). Every attribute fetch below retries
# with backoff so a throttled response never looks like "this person has no
# title / email".
set -u

# Org-specific: substring of the DN's OU that marks external/vendor *user*
# accounts (external Contact objects are detected generically via objectClass).
# Empty by default — set it to your directory's convention, e.g. "OU=Contractors"
# or "OU=External", to label those accounts as "User (external / vendor)".
VENDOR_OU_PATTERN=""

QUERY="$*"
if [ -z "$QUERY" ]; then
  echo "Usage: lookup.sh <email | name>     e.g.  lookup.sh \"Jane Doe\"" >&2
  exit 2
fi

# 1. Derive the realm and a reachable domain controller from the Kerberos ticket.
princ=$(klist 2>/dev/null | sed -n 's/.*[Pp]rincipal: *//p' | head -1)
if [ -z "$princ" ]; then
  echo "No Kerberos ticket found. Get one first, e.g.:  kinit <user>@<REALM>" >&2
  exit 1
fi
realm=${princ#*@}
dom=$(printf '%s' "$realm" | tr '[:upper:]' '[:lower:]')
dc=$(dig +short SRV "_ldap._tcp.dc._msdcs.$dom" | awk 'NR==1{print $4}' | sed 's/\.$//')
[ -z "$dc" ] && dc=$(dig +short SRV "_ldap._tcp.$dom" | awk 'NR==1{print $4}' | sed 's/\.$//')
if [ -z "$dc" ]; then
  echo "Could not find a domain controller for $dom via DNS SRV." >&2
  exit 1
fi

# Global Catalog: forest-wide, base "" spans every domain.
GC="ldap://$dc:3268"
ATTRS="displayName givenName sn company title department employeeID mail telephoneNumber physicalDeliveryOfficeName objectClass manager"
MAX_SHOW=12   # cap detailed output for very broad name matches

# Pull one attribute out of an LDIF record (passed as $2), decoding base64 (::).
field() { # $1=attr  $2=record
  local attr="$1" line
  line=$(printf '%s\n' "$2" | grep -m1 -E "^$attr:: ?|^$attr: ") || return 0
  case "$line" in
    "$attr:: "*) printf '%s' "${line#"$attr":: }" | base64 -D 2>/dev/null ;;
    "$attr: "*)  printf '%s' "${line#"$attr": }" ;;
  esac
}

# List matching DNs for a filter (no attributes requested → reliable under load).
dns_for() { # $1=filter
  ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "$GC" -b "" "$1" 1.1 2>/dev/null \
    | sed -n 's/^dn: //p'
}

# Fetch one entry's attributes by DN, retrying past the silent DN-only response.
fetch() { # $1=dn
  local dn="$1" out tries=0
  while [ "$tries" -lt 4 ]; do
    out=$(ldapsearch -Y GSSAPI -LLL -o ldif-wrap=no -H "$GC" -b "$dn" -s base \
            "(objectClass=*)" $ATTRS 2>/dev/null | grep -vE '^# ')
    printf '%s\n' "$out" | grep -qE '^displayName:' && break
    tries=$((tries + 1)); sleep "$tries"
  done
  printf '%s\n' "$out"
}

# Resolve a manager (or any) DN to a display name.
name_of_dn() { # $1=dn
  [ -z "$1" ] && return 0
  field displayName "$(fetch "$1")"
}

# Classify an entry: internal employee, external contact, or vendor account.
kind_of() { # $1=record  $2=dn
  local oc; oc=$(printf '%s\n' "$1" | grep -i '^objectClass:' | tr 'A-Z' 'a-z')
  if printf '%s' "$oc" | grep -q 'contact'; then
    echo "Contact (external)"
  elif [ -n "$VENDOR_OU_PATTERN" ] && printf '%s' "$2" | grep -qiE ",$VENDOR_OU_PATTERN"; then
    echo "User (external / vendor)"
  else
    echo "Employee"
  fi
}

# 2. Primary search (ANR), then a substring fallback if it finds nothing.
#    (Portable array fill — macOS ships bash 3.2, which has no `mapfile`.)
read_dns() { # $1=filter  -> populates global DNS array
  DNS=()
  local line
  while IFS= read -r line; do
    [ -n "$line" ] && DNS+=("$line")
  done < <(dns_for "$1")
}
read_dns "(anr=$QUERY)"
if [ "${#DNS[@]}" -eq 0 ]; then
  read_dns "(|(mail=*$QUERY*)(displayName=*$QUERY*)(proxyAddresses=*$QUERY*))"
fi

if [ "${#DNS[@]}" -eq 0 ]; then
  echo "No directory match for: $QUERY"
  exit 0
fi

# 3a. Exactly one match → full record, with the manager resolved to a name.
if [ "${#DNS[@]}" -eq 1 ]; then
  rec=$(fetch "${DNS[0]}")
  mgr=$(name_of_dn "$(field manager "$rec")")
  echo "# $(field displayName "$rec")"
  echo
  echo "- **Type:** $(kind_of "$rec" "${DNS[0]}")"
  echo "- **Email:** $(field mail "$rec")"
  echo "- **Title:** $(field title "$rec")"
  echo "- **Department:** $(field department "$rec")"
  echo "- **Company:** $(field company "$rec")"
  echo "- **Employee ID:** $(field employeeID "$rec")"
  echo "- **Phone:** $(field telephoneNumber "$rec")"
  echo "- **Office:** $(field physicalDeliveryOfficeName "$rec")"
  [ -n "$mgr" ] && echo "- **Manager:** $mgr"
  echo "- **DN:** ${DNS[0]}"
  exit 0
fi

# 3b. Several matches → a compact disambiguation list (no per-row manager call).
echo "${#DNS[@]} matches for \"$QUERY\" — narrow with an email for an exact hit:"
echo
shown=0
for dn in "${DNS[@]}"; do
  if [ "$shown" -ge "$MAX_SHOW" ]; then
    echo
    echo "_… and $(( ${#DNS[@]} - MAX_SHOW )) more. Refine the query._"
    break
  fi
  rec=$(fetch "$dn")
  name=$(field displayName "$rec"); [ -z "$name" ] && name=$(field cn "$rec")
  printf -- '- **%s** — %s\n' "$name" "$(kind_of "$rec" "$dn")"
  printf -- '    - %s · %s · %s\n' \
    "$(field mail "$rec")" "$(field title "$rec")" "$(field department "$rec")"
  printf -- '    - %s\n' "$dn"
  shown=$((shown + 1))
done
