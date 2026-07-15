#!/usr/bin/env bash
#
# Benchmark a compiled CLI binary: build it, report its size, then run a real
# command cold a fixed number of times and report startup+run latency.
#
#   Usage: scripts/bench-binary.sh
#          RUNS=50 scripts/bench-binary.sh
#
# This is a fixed reference point for evaluating build-system changes (for
# example `--bytecode`, `--minify`, or `--sourcemap` on `bun build --compile`;
# see https://bun.com/docs/bundler/bytecode). Build the binary today, record
# the size and timing numbers it prints, apply a build-system change, run this
# again, and compare. Nothing here is destructive.
#
# The CLI and command are hard-coded on purpose: `fit-wiki audit` is a real,
# representative, read-only command that exercises the full startup path plus
# meaningful work (walks a wiki root and runs the declarative rule catalogue).
# It runs against a checked-in fixture, so the workload is identical every run.
#
# "Cold" means each measured run is a fresh process — a new binary invocation
# with no warm JS state, which is exactly how a CLI is used in practice.
set -euo pipefail

# --- Reference workload (hard-coded on purpose) ------------------------------
CLI="fit-wiki"
WIKI_ROOT="libraries/libwiki/test/golden/fit-wiki/fixture"
CMD=(audit "--wiki-root=$WIKI_ROOT")
RUNS="${RUNS:-20}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- Resolve the host compile target so the binary runs here -----------------
os="$(uname -s)"; arch="$(uname -m)"
case "$os" in Linux) os=linux ;; Darwin) os=darwin ;; esac
case "$arch" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; esac
TARGET="${TARGET:-bun-$os-$arch}"

echo "==> Building $CLI for $TARGET"
bash build/build-binary.sh "$CLI" "$TARGET"

BIN="dist/binaries/$CLI"
[ -x "$BIN" ] || { echo "Error: expected binary at $BIN" >&2; exit 1; }

SIZE=$(wc -c < "$BIN")
GZSIZE=$(gzip -c "$BIN" | wc -c)

echo
echo "==> Size"
printf '  on disk   %s bytes (%.1f MB)\n' "$SIZE" "$(echo "$SIZE / 1048576" | bc -l)"
printf '  gzipped   %s bytes (%.1f MB)   # proxy for download size\n' "$GZSIZE" "$(echo "$GZSIZE / 1048576" | bc -l)"

echo
echo "==> Cold-run latency of \`$CLI ${CMD[*]}\` over $RUNS runs (+1 warmup)"

# Time each fresh invocation with Bun's high-resolution clock. The first run is
# discarded to absorb page-cache warmup; the rest are the reported sample.
bun -e '
const [bin, runsStr, ...cmd] = process.argv.slice(1);
const runs = Number(runsStr);
const times = [];
for (let i = 0; i <= runs; i++) {
  const t0 = performance.now();
  const p = Bun.spawnSync([bin, ...cmd], { stdout: "ignore", stderr: "ignore" });
  const dt = performance.now() - t0;
  if (i > 0) times.push(dt); // discard warmup run
}
times.sort((a, b) => a - b);
const sum = times.reduce((a, b) => a + b, 0);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
const f = (n) => n.toFixed(1).padStart(7);
console.log(`  min    ${f(times[0])} ms`);
console.log(`  median ${f(times[Math.floor(times.length / 2)])} ms`);
console.log(`  mean   ${f(sum / times.length)} ms`);
console.log(`  p95    ${f(pct(95))} ms`);
console.log(`  max    ${f(times[times.length - 1])} ms`);
' "$BIN" "$RUNS" "${CMD[@]}"
