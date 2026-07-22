#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FAKE_BIN="$(mktemp -d)"
trap 'rm -rf "$FAKE_BIN"' EXIT

cat >"$FAKE_BIN/fzf" <<'EOF'
#!/usr/bin/env bash
cat >/dev/null
printf '%s\n' 'google--gemma-4-26b-a4b-qat.json'
EOF

cat >"$FAKE_BIN/harbor" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@"
EOF

chmod +x "$FAKE_BIN/fzf" "$FAKE_BIN/harbor"
output="$(PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh" -p ./tests/ssh-key-pair)"
no_args_output="$(PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh")"

grep -Fx 'lmstudio/google/gemma-4-26b-a4b-qat' <<<"$output" >/dev/null
grep -Fx "models_json_path=$ROOT_DIR/harbor_agents/models/google--gemma-4-26b-a4b-qat.json" <<<"$output" >/dev/null
grep -Fx './tests/ssh-key-pair' <<<"$output" >/dev/null
grep -Fx 'lmstudio/google/gemma-4-26b-a4b-qat' <<<"$no_args_output" >/dev/null
