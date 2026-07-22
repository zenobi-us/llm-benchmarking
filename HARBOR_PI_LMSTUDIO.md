# Harbor Pi agent using LM Studio

This project-local Harbor agent subclasses Harbor's built-in `pi` integration. During agent setup it installs Pi and writes the LM Studio provider to the task container's `$HOME/.pi/agent/models.json`.

## Configuration

- Harbor: `0.18.0`
- Agent import: `harbor_agents.pi_lmstudio:PiLmStudio`
- Provider: `lmstudio`
- Endpoint: `http://127.0.0.1:1234/v1`
- Model: selected from LM Studio's `GET /v1/models` response

The wrapper gives Harbor's main container host networking, so the container reaches LM Studio through `127.0.0.1`.

## Run

The wrapper requires `curl`, `fzf`, and `jq`. It queries LM Studio, opens an `fzf` picker for the returned model IDs, then writes a temporary Pi `models.json` for the selected model.

```bash
./run-pi-lmstudio.sh -p ./ssh-key-pair
```

For a registry dataset:

```bash
./run-pi-lmstudio.sh -d terminal-bench@2.0 -l 1
```

The generated config uses Pi's `openai-completions` provider format and is mounted through the existing `models_json_path` agent argument.

## Session export

Each trial saves Pi's persisted session and exports a self-contained HTML transcript after the agent stops:

```text
jobs/<job>/<trial>/agent/session.jsonl
jobs/<job>/<trial>/agent/session.html
jobs/<job>/<trial>/agent/session-export.txt
```

Export is attempted even when Pi exits with an error, so partial sessions are preserved. Export failure is recorded in `session-export.txt` but does not change the benchmark result.

Pi's `/export session.html` syntax is an interactive TUI command. Harbor runs Pi in non-interactive JSON mode, so the agent uses the equivalent two-step CLI flow: `pi --session ...` followed by `pi --export ... session.html`.

## Override defaults

By default, the agent derives the custom-provider model ID from Harbor's `--model` value. You can still pass a complete Pi provider config with `models_json_path`:

```bash
harbor run \
  -a harbor_agents.pi_lmstudio:PiLmStudio \
  -m lmstudio/google/gemma-4-26b-a4b-qat \
  --allow-agent-host <host-ip> \
  --agent-kwarg models_json_path=/path/to/models.json \
  --agent-kwarg lmstudio_base_url=http://<host-ip>:1234/v1 \
  -p ./ssh-key-pair
```

The path is read by the host Harbor process. It must exist and contain valid JSON. When supplied, its LM Studio `baseUrl` is replaced with `lmstudio_base_url`; model and API-key overrides only affect generated config.

Harbor passes generated-config endpoint or API-key overrides with `--agent-kwarg`:

```bash
harbor run \
  -a harbor_agents.pi_lmstudio:PiLmStudio \
  -m lmstudio/google/gemma-4-26b-a4b-qat \
  --allow-agent-host <host-ip> \
  --agent-kwarg lmstudio_base_url=http://<host-ip>:1234/v1 \
  -p ./ssh-key-pair
```

Run from this repository, or add its root to `PYTHONPATH`, so Harbor can import the custom agent module.

## Verify LM Studio

```bash
curl -fsS http://127.0.0.1:1234/v1/models
```

The configured model ID must exactly match an ID returned by that endpoint.
