#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FAMILY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$FAMILY_ROOT/../.." && pwd)"

REGIME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --regime) REGIME="$2"; shift 2 ;;
    *) echo "stage-family.sh: unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ "$REGIME" = "in-repo" ] || [ "$REGIME" = "published" ] || {
  echo "stage-family.sh: --regime in-repo|published required" >&2; exit 2; }

CLAUDE="$FAMILY_ROOT/.claude"
LOCK="$FAMILY_ROOT/apm.lock.yaml"
JUDGE_SRC="$FAMILY_ROOT/judge.md"

[ -f "$JUDGE_SRC" ] || {
  echo "stage-family.sh: missing family-local judge profile at $JUDGE_SRC" >&2
  exit 1
}

# Safety: refuse to rm -rf paths outside the family root.
case "$CLAUDE" in
  "$FAMILY_ROOT"/.claude) ;;
  *) echo "stage-family.sh: refusing to clean $CLAUDE outside family root" >&2; exit 1 ;;
esac

# Portable sha256. Linux has sha256sum; macOS ships shasum.
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum
  else shasum -a 256
  fi
}

rm -rf "$CLAUDE" "$LOCK"
mkdir -p "$CLAUDE/skills" "$CLAUDE/agents"
cp "$JUDGE_SRC" "$CLAUDE/agents/judge.md"

if [ "$REGIME" = "in-repo" ]; then
  # Strip trailing slash so BSD and GNU cp -R agree on directory semantics.
  for d in "$MONOREPO_ROOT"/.claude/skills/kata-*/; do
    [ -d "$d" ] || continue
    cp -R "${d%/}" "$CLAUDE/skills/"
  done
  for f in "$MONOREPO_ROOT"/.claude/agents/*.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    [ "$name" = "judge.md" ] && continue
    cp "$f" "$CLAUDE/agents/$name"
  done
  ID="sha256:$(
    cd "$CLAUDE" && find . -type f | LC_ALL=C sort \
      | while IFS= read -r p; do sha256 < "$p" | awk -v p="$p" '{print $1, p}'; done \
      | sha256 | cut -d' ' -f1
  )"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  # kata-skills is public; thread GITHUB_TOKEN when present to avoid anonymous
  # rate-limiting on shared CI IPs.
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/forwardimpact/kata-skills"
  else
    CLONE_URL="https://github.com/forwardimpact/kata-skills"
  fi
  git clone --depth=1 "$CLONE_URL" "$TMP/pack"
  SHA="$(cd "$TMP/pack" && git rev-parse HEAD)"
  VERSION="$(awk -F': ' '/^version:/{print $2; exit}' "$TMP/pack/apm.yml")"
  # Strip optional quoting around the value (`version: "1.2.3"` form).
  VERSION="${VERSION#\"}"; VERSION="${VERSION%\"}"
  [ -n "$VERSION" ] || { echo "stage-family.sh: could not parse version from apm.yml" >&2; exit 1; }
  for d in "$TMP/pack"/skills/kata-*/; do
    [ -d "$d" ] || continue
    cp -R "${d%/}" "$CLAUDE/skills/"
  done
  for f in "$TMP/pack"/agents/*.agent.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f" .agent.md).md"
    [ "$name" = "judge.md" ] && continue
    cp "$f" "$CLAUDE/agents/$name"
  done
  ID="${VERSION}@${SHA}"
fi

cat > "$LOCK" <<EOF
apm_lock_version: 1
dependencies: []
benchmark:
  regime: ${REGIME}
  source_identity: ${ID}
EOF
