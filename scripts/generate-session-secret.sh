#!/usr/bin/env bash
set -euo pipefail

# Generate a 32-byte random secret (base64) for SESSION_SECRET
# Usage:
#   ./scripts/generate-session-secret.sh                # prints secret to stdout
#   ./scripts/generate-session-secret.sh --write-env .env  # writes/updates SESSION_SECRET in .env
#   BYTES=64 ./scripts/generate-session-secret.sh       # override bytes (default 32)

BYTES=${BYTES:-32}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    # Generate BYTES random bytes and encode as base64
    openssl rand -base64 "${BYTES}" | tr -d '\n'
  else
    # Fallback using /dev/urandom and base64
    head -c "${BYTES}" /dev/urandom | base64 | tr -d '\n'
  fi
}

write_env() {
  local env_file=$1
  local secret=$2

  # Create file if missing
  if [ ! -f "$env_file" ]; then
    printf "SESSION_SECRET=%s\n" "$secret" > "$env_file"
    echo "Created $env_file with SESSION_SECRET"
    return 0
  fi

  # Replace existing SESSION_SECRET=... line or append if not present (portable AWK approach)
  local tmp_file
  tmp_file=$(mktemp)
  awk -v newval="$secret" '
    BEGIN { replaced=0 }
    /^SESSION_SECRET=/ { print "SESSION_SECRET=" newval; replaced=1; next }
    { print }
    END { if (!replaced) print "SESSION_SECRET=" newval }
  ' "$env_file" > "$tmp_file"
  mv "$tmp_file" "$env_file"
  echo "Updated $env_file with SESSION_SECRET"
}

main() {
  if [[ "${1:-}" == "--write-env" ]]; then
    local env_path=${2:-.env}
    secret=$(generate_secret)
    write_env "$env_path" "$secret"
  else
    generate_secret; echo
  fi
}

main "$@"


