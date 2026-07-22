# Composable Harbor agents

These modules separate two reasons an agent changes:

1. `AgentProviderBase` and provider mixins describe how to reach a model source.
2. Harness bases such as `PiMonoAgentBase` translate provider declarations into
   harness configuration, run the harness, and export harness-specific evidence.

Job-wide lifecycle behavior does not belong in an agent mixin. The separate
`harbor_agents.job_index:JobIndexPlugin` updates `jobs.jsonl` only after Harbor
has finished every trial and written the aggregate job result.

The provider layer must not write Pi or OpenCode configuration directly. A provider
returns an `AgentProviderSpec`; the harness decides how to consume it. This boundary
allows the same LM Studio or Bedrock provider to be reused by another harness.

## Lifecycle and MRO

Concrete agents use cooperative multiple inheritance:

```text
Harbor setup
  -> AgentProviderBase.install
     -> harness.install
     -> harness.configure_model_provider(provider_spec)

Harbor run
  -> harness.run
     -> execute harness
     -> export session in finally

Harbor job completion
  -> write aggregate result.json
  -> JobIndexPlugin.on_job_end
     -> append one jobs.jsonl record
```

For `PiLmStudio`, the required order is:

```python
class PiLmStudio(LmStudioAgentProvider, PiMonoAgentBase):
    ...
```

Do not reorder these bases casually. The provider must sit before the harness so
its cooperative `install()` can pass the provider spec forward, and only the
harness should render the prompt template.
Decorating another `run()` layer would render prompt templates twice.

## Adding a provider

Subclass `AgentProviderBase` and define:

- `PROVIDER_NAME`
- `DEFAULT_MODEL_ID` when a useful default exists
- `provider_spec()` for connection details
- `provider_runtime_environment()` for credentials that must reach the harness

Mark local providers with `LOCAL_PROVIDER = True`. Harnesses may use that signal for
offline behavior; providers should not set harness-specific environment variables.

## Adding a harness

The harness base should:

- install its executable through Harbor's environment APIs
- implement `configure_model_provider(environment, provider_spec)`
- implement one prompt-rendered `run()` method
- expose `session_artifact_path()` when it produces a viewer artifact
- export evidence in `finally` so failed runs remain inspectable

Keep concrete Harbor import paths small. They should compose bases and provide a
stable `name()`, while reusable behavior remains under `harbor_agents/base/`.