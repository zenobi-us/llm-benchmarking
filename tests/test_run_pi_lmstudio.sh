#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FAKE_BIN="$(mktemp -d)"
trap 'rm -rf "$FAKE_BIN"' EXIT

cat >"$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
[[ "${!#}" == "http://127.0.0.1:1234/v1/models" ]]
if [[ "${CURL_FAILURE:-0}" == "1" ]]; then
	exit 1
fi
if [[ "${NO_MODELS:-0}" == "1" ]]; then
	printf '%s\n' '{"data":[]}'
else
	printf '%s\n' '{"data":[{"id":"qwen3.5-9b"},{"id":"google/gemma-4-26b-a4b-qat"}]}'
fi
EOF

cat >"$FAKE_BIN/fzf" <<'EOF'
#!/usr/bin/env bash
input="$(cat)"
grep -Fx 'google/gemma-4-26b-a4b-qat' <<<"$input" >/dev/null
grep -Fx 'qwen3.5-9b' <<<"$input" >/dev/null
printf '%s\n' 'google/gemma-4-26b-a4b-qat'
EOF

cat >"$FAKE_BIN/harbor" <<'EOF'
#!/usr/bin/env bash
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
	case "${args[i]}" in
	--extra-docker-compose)
		grep -Fx '    network_mode: host' "${args[i + 1]}" >/dev/null
		printf '%s\n' 'host-network-overlay-ok'
		;;
	--agent-kwarg)
		if [[ "${args[i + 1]}" == models_json_path=* ]]; then
			config_path="${args[i + 1]#models_json_path=}"
			jq -e '
				.providers.lmstudio.baseUrl == "http://127.0.0.1:1234/v1"
				and .providers.lmstudio.api == "openai-completions"
				and .providers.lmstudio.apiKey == "lm-studio"
				and .providers.lmstudio.compat.supportsDeveloperRole == false
				and .providers.lmstudio.compat.supportsReasoningEffort == false
				and .providers.lmstudio.models == [{"id":"google/gemma-4-26b-a4b-qat"}]
			' "$config_path" >/dev/null
			printf '%s\n' 'generated-model-config-ok'
		fi
		;;
	esac
done
printf '%s\n' "$@"
EOF

chmod +x "$FAKE_BIN/curl" "$FAKE_BIN/fzf" "$FAKE_BIN/harbor"
output="$(PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh" -p ./benchmarks/ssh-key-pair)"
no_args_output="$(PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh")"

grep -Fx 'lmstudio/google/gemma-4-26b-a4b-qat' <<<"$output" >/dev/null
grep -F 'models_json_path=' <<<"$output" >/dev/null
grep -Fx 'lmstudio_base_url=http://127.0.0.1:1234/v1' <<<"$output" >/dev/null
grep -Fx 'generated-model-config-ok' <<<"$output" >/dev/null
grep -Fx 'host-network-overlay-ok' <<<"$output" >/dev/null
grep -Fx -- '--extra-docker-compose' <<<"$output" >/dev/null
grep -Fx './benchmarks/ssh-key-pair' <<<"$output" >/dev/null
grep -Fx "$ROOT_DIR/benchmarks/ssh-key-pair" <<<"$no_args_output" >/dev/null

if connection_error="$(CURL_FAILURE=1 PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh" 2>&1)"; then
	echo "Expected unavailable LM Studio check to fail" >&2
	exit 1
fi
grep -F 'Cannot reach LM Studio at http://127.0.0.1:1234/v1. Start the LM Studio local server, then retry.' <<<"$connection_error" >/dev/null

if models_error="$(NO_MODELS=1 PATH="$FAKE_BIN:$PATH" "$ROOT_DIR/run-pi-lmstudio.sh" 2>&1)"; then
	echo "Expected empty LM Studio model list to fail" >&2
	exit 1
fi
grep -F 'LM Studio has no available models. Add or load a model, then retry.' <<<"$models_error" >/dev/null
