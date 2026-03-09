#!/usr/bin/env bash
# Load environment files and exec into command
# Usage: scripts/env.sh <command> [args...]
#        ENV=docker scripts/env.sh <command>
#        STORAGE=minio scripts/env.sh <command>
#        AUTH=supabase scripts/env.sh <command>

set -e

ENV="${ENV:-local}"
STORAGE="${STORAGE:-local}"
AUTH="${AUTH:-none}"

set -a
[ -f .env ] && source .env
[ -f ".env.${ENV}" ] && source ".env.${ENV}"
[ -f ".env.storage.${STORAGE}" ] && source ".env.storage.${STORAGE}"
[ -f ".env.auth.${AUTH}" ] && source ".env.auth.${AUTH}"
set +a

exec "$@"
