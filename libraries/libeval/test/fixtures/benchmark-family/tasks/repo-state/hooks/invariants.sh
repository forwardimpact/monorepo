#!/bin/sh
# Repo-state invariants: asserts SHA-256 of `$WORKDIR/result.txt` matches the
# digest of "hello\n".
EXPECTED="5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03"
F="$WORKDIR/result.txt"
if [ ! -f "$F" ]; then
  printf '%s\n' '{"test":"file","pass":false,"message":"result.txt missing"}' >&"$RESULTS_FD"
  exit 1
fi
# Portable sha256: Linux has sha256sum; macOS 14 ships only shasum.
if command -v sha256sum >/dev/null 2>&1; then
  GOT="$(sha256sum "$F" | awk '{print $1}')"
else
  GOT="$(shasum -a 256 "$F" | awk '{print $1}')"
fi
if [ "$GOT" = "$EXPECTED" ]; then
  printf '%s\n' '{"test":"sha","pass":true}' >&"$RESULTS_FD"
  exit 0
fi
printf '%s\n' '{"test":"sha","pass":false,"message":"sha mismatch"}' >&"$RESULTS_FD"
exit 1
