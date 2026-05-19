#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 <server-base-url> <master-token> <backup-json-path> [--clear]

Example:
  $0 https://meu-crm.com "TOKEN_MASTER" ./crm-energia-backup.json --clear

This script POSTs the JSON file to /api/import-backup on the server.
EOF
}

if [ "$#" -lt 3 ]; then
  usage
  exit 1
fi

SERVER="$1"
TOKEN="$2"
FILE="$3"
CLEAR_ARG="${4:-}"

if [ ! -f "$FILE" ]; then
  echo "ERROR: file not found: $FILE" >&2
  exit 2
fi

# Build URL
SERVER="${SERVER%/}"
URL="$SERVER/api/import-backup"
if [ "$CLEAR_ARG" = "--clear" ] || [ "$CLEAR_ARG" = "clear" ] || [ "$CLEAR_ARG" = "true" ]; then
  URL="$URL?clear=true"
fi

echo "Uploading $FILE to $URL"

curl --fail --show-error -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$FILE"

RC=$?
if [ $RC -ne 0 ]; then
  echo "Upload failed (curl exit $RC)" >&2
  exit $RC
fi

echo "Upload finished successfully."