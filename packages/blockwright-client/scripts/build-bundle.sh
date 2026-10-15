#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  echo 'Release bundles require Linux x86_64.' >&2
  exit 1
fi
DIST="$REPO_ROOT/packages/blockwright-client/dist"
# Never let a failed rebuild leave a valid-looking bundle behind.
rm -f "$DIST/bundle-manifest.json" "$DIST/blockwright"
rm -rf "$DIST/agents"
mkdir -p "$DIST"
NATIVE_TARGET_DIR="${CARGO_TARGET_DIR:-$REPO_ROOT/target}"
cargo build --locked --release --target-dir "$NATIVE_TARGET_DIR"
cp "$NATIVE_TARGET_DIR/release/blockwright" "$DIST/blockwright"
for project in neoforge-agent forge-agent coverage-report; do
  "$REPO_ROOT/$project/gradlew" -p "$REPO_ROOT/$project" --no-daemon clean build
done
sh "$SCRIPT_DIR/bundle-agents.sh"
