#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="$ROOT_DIR${PYTHONPATH:+:$PYTHONPATH}"

for command in curl fzf jq; do
	if ! command -v "$command" >/dev/null; then
		echo "Required command not found: $command" >&2
		exit 127
	fi
done

lmstudio_base_url="http://127.0.0.1:1234/v1"
if ! lmstudio_models="$(curl -fsS --max-time 3 "$lmstudio_base_url/models")"; then
	echo "LM Studio API is not reachable at $lmstudio_base_url" >&2
	exit 1
fi

if ! model_ids="$(jq -er '
	.data
	| arrays
	| map(.id | strings | select(length > 0))
	| unique
	| if length > 0 then .[] else error("no models") end
' <<<"$lmstudio_models" 2>/dev/null)"; then
	echo "LM Studio returned no available models at $lmstudio_base_url/models" >&2
	exit 1
fi

if ! model_id="$(fzf --prompt='LM Studio model: ' --height=40% --reverse <<<"$model_ids")"; then
	echo "Model selection cancelled." >&2
	exit 130
fi

runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/pi-lmstudio.XXXXXX")"
trap 'rm -rf "$runtime_dir"' EXIT
models_json_path="$runtime_dir/models.json"
host_network_compose="$runtime_dir/host-network.yaml"

jq -n \
	--arg base_url "$lmstudio_base_url" \
	--arg model_id "$model_id" \
	'{
		providers: {
			lmstudio: {
				baseUrl: $base_url,
				api: "openai-completions",
				apiKey: "lm-studio",
				compat: {
					supportsDeveloperRole: false,
					supportsReasoningEffort: false
				},
				models: [{id: $model_id}]
			}
		}
	}' >"$models_json_path"

cat >"$host_network_compose" <<'EOF'
services:
  main:
    network_mode: host
EOF

harbor run \
	--extra-docker-compose "$host_network_compose" \
	--agent harbor_agents.pi_lmstudio:PiLmStudio \
	--model "lmstudio/$model_id" \
	--agent-kwarg "models_json_path=$models_json_path" \
	--agent-kwarg "lmstudio_base_url=$lmstudio_base_url" \
	"$@"
