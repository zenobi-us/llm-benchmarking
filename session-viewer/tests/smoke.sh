#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-$((20000 + RANDOM % 20000))}"
TEMP_JOB="$APP_DIR/../jobs/viewer-smoke-$$"
LOG_FILE="$(mktemp)"
EVENTS_FILE="$(mktemp)"
SESSIONS_FILE="$(mktemp)"

cleanup() {
  rm -rf "$TEMP_JOB" "$LOG_FILE" "$EVENTS_FILE" "$SESSIONS_FILE"
  kill "${server_pid:-}" "${events_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT

cd "$APP_DIR"
PORT="$PORT" bun src/server.ts >"$LOG_FILE" 2>&1 &
server_pid=$!

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/sessions" >"$SESSIONS_FILE"; then
    break
  fi
  sleep 0.1
done

sessions="$(cat "$SESSIONS_FILE")"
[[ "$sessions" == *'"path"'* ]]
curl -fsS "http://127.0.0.1:$PORT/" | grep -F '<title>Pi Session Viewer</title>' >/dev/null

curl -Ns --max-time 5 "http://127.0.0.1:$PORT/api/events" >"$EVENTS_FILE" &
events_pid=$!
mkdir -p "$TEMP_JOB/trial__smoke/agent"
printf '<!doctype html><title>Smoke session</title>\n' >"$TEMP_JOB/trial__smoke/agent/session.html"

for _ in {1..40}; do
  grep -F 'event: sessions' "$EVENTS_FILE" >/dev/null && break
  sleep 0.1
done
grep -F 'event: sessions' "$EVENTS_FILE" >/dev/null
