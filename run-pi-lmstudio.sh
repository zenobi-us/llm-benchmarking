#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$ROOT_DIR/harbor_agents/models"
export PYTHONPATH="$ROOT_DIR${PYTHONPATH:+:$PYTHONPATH}"

for command in fzf jq; do
	if ! command -v "$command" >/dev/null; then
		echo "Required command not found: $command" >&2
		exit 127
	fi
done

shopt -s nullglob
model_files=("$MODELS_DIR"/*.json)
if ((${#model_files[@]} == 0)); then
	echo "No model configs found in $MODELS_DIR" >&2
	exit 1
fi

if ! model_file="$({ printf '%s\n' "${model_files[@]##*/}" | sort; } | fzf --prompt='LM Studio model: ' --height=40% --reverse)"; then
	echo "Model selection cancelled." >&2
	exit 130
fi

models_json_path="$MODELS_DIR/$model_file"
if ! model_id="$(jq -er '.providers.lmstudio.models[0].id | strings | select(length > 0)' "$models_json_path")"; then
	echo "Missing LM Studio model ID in $models_json_path" >&2
	exit 1
fi

exec harbor run \
	--agent harbor_agents.pi_lmstudio:PiLmStudio \
	--model "lmstudio/$model_id" \
	--agent-kwarg "models_json_path=$models_json_path" \
	--allow-agent-host 192.168.86.35 \
	"$@"
