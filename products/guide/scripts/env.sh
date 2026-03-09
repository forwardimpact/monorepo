#!/usr/bin/env bash
# Load environment files and exec into command
# Usage: scripts/env.sh <command> [args...]
#        ENV=docker scripts/env.sh <command>
#        STORAGE=minio scripts/env.sh <command>
#        AUTH=supabase scripts/env.sh <command>

set -e

# Default to local for ENV, STORAGE, and AUTH
ENV="${ENV:-local}"
STORAGE="${STORAGE:-local}"
AUTH="${AUTH:-none}"

# Load environment files (skip if not found)
set -a
[ -f .env ] && source .env
[ -f ".env.${ENV}" ] && source ".env.${ENV}"
[ -f ".env.storage.${STORAGE}" ] && source ".env.storage.${STORAGE}"
[ -f ".env.auth.${AUTH}" ] && source ".env.auth.${AUTH}"

# Pin storage root to the guide product directory so that npx --workspace=
# invocations (which change cwd to the library package) still resolve
# config/, data/, and generated/ relative to the product root.
STORAGE_ROOT="${STORAGE_ROOT:-$(pwd)}"
set +a

# Execute the command
exec "$@"
