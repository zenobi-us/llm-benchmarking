# LLM benchmarking with Pi and LM Studio

Run Harbor benchmarks against models served locally by LM Studio. This repository provides:

- a Harbor agent that installs and runs Pi inside each task container;
- an interactive launcher that discovers loaded LM Studio models;
- a small local benchmark for checking the full setup;
- a browser viewer for exported Pi sessions.

## Runtime flow

```text
LM Studio GET /v1/models
          |
          v
      fzf picker
          |
          v
 temporary Pi models.json
          |
          v
 Harbor -> Docker task -> Pi -> LM Studio
          |
          v
      jobs/<job>/
```

## Requirements

Current launcher assumes a Linux host because the Harbor container uses Docker host networking.

Install and start:

- [Docker](https://docs.docker.com/engine/install/)
- [LM Studio](https://lmstudio.ai/)
- [`mise`](https://mise.jdx.dev/) for the pinned Harbor version
- `curl`, `fzf`, and `jq`

LM Studio must have a model loaded and its local API server running on `127.0.0.1:1234`.

## Setup

```bash
git clone https://github.com/zenobi-us/llm-benchmarking.git
cd llm-benchmarking
mise install
```

Verify the host tools:

```bash
docker info >/dev/null
harbor --version   # expected: 0.18.0
curl -fsS http://127.0.0.1:1234/v1/models | jq -r '.data[].id'
```

If the final command returns no model IDs, load a model in LM Studio before continuing.

## Run the local smoke benchmark

```bash
./run-pi-lmstudio.sh \
  --job-name ssh-key-smoke \
  -p ./benchmarks/ssh-key-pair
```

With no Harbor arguments, the launcher runs `benchmarks/ssh-key-pair`.

Select a model in the `fzf` prompt. The launcher then:

1. queries LM Studio's `/v1/models` endpoint;
2. generates a temporary Pi `models.json` for the selected model;
3. gives the Harbor task container host networking;
4. runs `harbor_agents.pi_lmstudio:PiLmStudio`;
5. removes temporary configuration after Harbor exits.

The included task asks the model to create an unencrypted SSH key pair and verifies the generated files.

## Run a registry dataset

Pass normal `harbor run` arguments through the launcher:

```bash
./run-pi-lmstudio.sh \
  --job-name terminal-bench-smoke \
  -d terminal-bench@2.0 \
  -l 1 \
  -n 1
```

Useful Harbor options:

| Option | Purpose |
| --- | --- |
| `-p PATH` | Run a local task or dataset directory |
| `-d NAME@VERSION` | Run a registry dataset |
| `-l N` | Limit number of tasks |
| `-n N` | Set concurrent trials |
| `-k N` | Set attempts per trial |
| `--job-name NAME` | Give the output directory a stable name |
| `--debug` | Enable Harbor debug logging |

Run `harbor run --help` for the complete option list.

## Results

Harbor writes runs beneath `jobs/`:

```text
jobs/<job>/
├── config.json
├── result.json
└── <trial>/
    ├── agent/
    │   ├── pi.txt
    │   ├── session.jsonl
    │   ├── session.html
    │   └── session-export.txt
    ├── config.json
    └── verifier/
```

`result.json` contains aggregate job status and evaluation results. Trial directories contain agent output, verifier output, and Pi session exports. Session export is best-effort; inspect `session-export.txt` when `session.html` is missing.

## View benchmark reports

The static viewer reads `jobs.jsonl`, then loads each indexed job's `config.json` and aggregate `result.json` directly from `jobs/`. Harbor's `JobIndexPlugin` appends one record after all trials finish.

```bash
python -m http.server
```

Open <http://localhost:8000>. No build step or application server is required. Tailwind v4 and the typefaces load from public CDNs, so the viewer needs network access. Opening `index.html` through `file://` will not work because browsers block local `fetch()` calls.

## Troubleshooting

`LM Studio API is not reachable`

- Start LM Studio's local server.
- Confirm it listens on port `1234`.
- Run `curl -fsS http://127.0.0.1:1234/v1/models` on the host.

`LM Studio returned no available models`

- Load a model in LM Studio.
- Confirm `/v1/models` returns a non-empty `data` array with `id` fields.

`Required command not found`

- Install the named command. The launcher checks `curl`, `fzf`, and `jq` before starting Harbor.

Docker or task setup failures

- Run `docker info` and `harbor --version`.
- Retry with `--debug`.
- Inspect `jobs/<job>/<trial>/agent/` and the trial `config.json`.

## Repository map

```text
run-pi-lmstudio.sh            Model picker and Harbor launcher
harbor_agents/pi_lmstudio.py  Stable Pi + LM Studio composition
harbor_agents/base/           Reusable lifecycle, provider, and harness bases
harbor_agents/tests/          Python agent unit tests
HARBOR_PI_LMSTUDIO.md         Agent configuration details
benchmarks/ssh-key-pair/      Local Harbor benchmark task
tests/                        Launcher tests
index.html                    Viewer markup, Tailwind v4 theme, and browser runtime
app.js                        Viewer behavior and Tailwind utility classes
jobs.jsonl                    Append-only completed-job index for the viewer
jobs/                         Generated benchmark runs
```

See [HARBOR_PI_LMSTUDIO.md](HARBOR_PI_LMSTUDIO.md) for manual agent configuration and session export details.
