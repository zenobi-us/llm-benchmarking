# Project Context

This project runs Harbor benchmarks through Pi against models served locally by LM Studio. Benchmark artifacts live under `jobs/`.

The planned report viewer is a simple static website. It reads `jobs.jsonl`, which is updated whenever `harbor_agents/pi_lmstudio.py` runs, and presents job/session results without requiring an application server.

## Design Context

### Users

Primary users are public benchmark readers, including people who did not run the benchmark and may not know Harbor, Pi, or the repository layout. They need to quickly understand what ran, which model and task were involved, whether the run succeeded, what score or outcome it produced, and where supporting session details can be inspected.

The interface should support fast scanning first, then progressive inspection of an individual job report. Raw implementation and artifact-path details are secondary evidence, not the primary reading experience.

### Brand Personality

Quiet, technical, credible.

Voice should be concise, factual, and transparent about status, failures, and missing data. The interface should evoke calm and confidence. It should feel like dependable engineering evidence rather than a promotional benchmark leaderboard.

### Aesthetic Direction

Use a restrained dark technical theme: charcoal background, subtle slate surfaces, crisp sans-serif body text, compact monospace metadata, and one restrained accent color. Status must remain understandable without color.

Favor clear report hierarchy, compact job summaries, readable result details, and minimal motion. Avoid marketing-dashboard gloss, gradients, ornamental effects, terminal cosplay, excessive neon, and decorative charts that do not improve comprehension.

No existing brand assets, logos, fonts, color tokens, component library, or current frontend design system constrain the implementation. The deleted historical session viewer is not a design reference.

### Design Principles

1. **Lead with the result.** Show job identity, model, task, status, score, and timestamp before logs or file paths.
2. **Make evidence inspectable.** Let readers move from summary to session/report details without hiding failures, missing fields, or provenance.
3. **Optimize for unfamiliar readers.** Use plain labels and enough context to understand a benchmark without repository knowledge.
4. **Stay visually quiet.** Use strong hierarchy, restrained color, compact metadata, and no decoration without informational value.
5. **Keep the static experience robust.** Render useful empty, loading, malformed-data, and partial-job states; provide semantic HTML, keyboard access, visible focus, strong contrast, non-color status cues, and reduced-motion-safe behavior.
