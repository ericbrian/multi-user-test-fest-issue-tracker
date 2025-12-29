#!/usr/bin/env bash
set -euo pipefail

# Sets Heroku config vars from .env.production WITHOUT printing secret values.
#
# Usage:
#   ./scripts/heroku-set-config-from-env-production.sh <heroku-app-name>
#
# Notes:
# - Heroku does NOT read .env files at runtime; it uses config vars.
# - This script uses the Heroku Platform API to avoid the CLI echoing values.

APP_NAME="${1:-}"
if [[ -z "$APP_NAME" ]]; then
  echo "Usage: $0 <heroku-app-name>" >&2
  exit 2
fi

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production in repo root" >&2
  exit 2
fi

if ! command -v heroku >/dev/null 2>&1; then
  echo "Heroku CLI not found" >&2
  exit 2
fi

TOKEN="$(heroku auth:token)"
WEB_URL="$(heroku apps:info -a "$APP_NAME" -s | awk -F= '/^web_url=/{print $2}')"
if [[ -z "$WEB_URL" ]]; then
  echo "Could not determine web_url for app: $APP_NAME" >&2
  exit 2
fi

JSON_PAYLOAD="$(node <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('.env.production', 'utf8');

const env = {};
for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();

  // Strip surrounding quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }

  env[k] = v;
}

// Only set known vars (avoid accidentally uploading unrelated local config)
const allow = [
  'DATABASE_URL',
  'DB_SCHEMA',
  'SESSION_SECRET',
  'ENTRA_ISSUER',
  'ENTRA_CLIENT_ID',
  'ENTRA_CLIENT_SECRET',
  'ENTRA_REDIRECT_URI',
  'TAGS',
  'GROUPIER_EMAILS',
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'JIRA_ISSUE_TYPE',
];

const out = {
  NODE_ENV: 'production',
  // App enforces schema allowlist; keep default explicit.
  DB_SCHEMA: env.DB_SCHEMA || 'testfest',
};

for (const k of allow) {
  const v = env[k];
  if (v == null) continue;
  const s = String(v).trim();
  if (!s) continue;
  out[k] = s;
}

process.stdout.write(JSON.stringify(out));
NODE
)"

# If .env.production still points at localhost, force redirect URI to match the Heroku app URL.
JSON_PAYLOAD="$(JSON_IN="$JSON_PAYLOAD" WEB_URL="$WEB_URL" node -e "const base=JSON.parse(process.env.JSON_IN||'{}'); const cur=String(base.ENTRA_REDIRECT_URI||''); if (!cur || /localhost/i.test(cur)) { base.ENTRA_REDIRECT_URI=String(process.env.WEB_URL||'')+'auth/callback'; } process.stdout.write(JSON.stringify(base));")"

STATUS="$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  -H "Accept: application/vnd.heroku+json; version=3" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.heroku.com/apps/${APP_NAME}/config-vars" \
  -d "$JSON_PAYLOAD")"

if [[ "$STATUS" != "200" ]]; then
  # Fetch error details without printing secret values.
  ERR_BODY="$(curl -s -X PATCH \
    -H "Accept: application/vnd.heroku+json; version=3" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    "https://api.heroku.com/apps/${APP_NAME}/config-vars" \
    -d "$JSON_PAYLOAD")"
  SAFE_ERR="$(node -e "try{const o=JSON.parse(process.env.B||'{}'); const out={id:o.id||null, message:o.message||null}; process.stdout.write(JSON.stringify(out));}catch(e){process.stdout.write('{\"message\":\"Unknown error\"}');}" B="$ERR_BODY")"
  echo "Failed to set config vars (HTTP $STATUS): $SAFE_ERR" >&2
  exit 1
fi

echo "Heroku config vars updated from .env.production for app: $APP_NAME"