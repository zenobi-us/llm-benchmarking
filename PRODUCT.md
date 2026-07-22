# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are public benchmark readers, including people who did not run the benchmark and may not know Harbor, Pi, LM Studio, or the repository layout. They need to identify what ran, which model and task were involved, whether the run succeeded, what score or outcome it produced, and where the supporting transcript and raw result can be inspected.

Benchmark operators are a supporting audience. They run local models through the repository's Harbor/Pi integration and publish the resulting artifacts consumed by the archive.

## Product Purpose

Provide a public benchmark archive that turns generated run artifacts into readable, inspectable reports. Success means an unfamiliar reader can quickly understand a run's result and then verify it through its transcript and raw evidence.

## Positioning

The product is an evidence-first benchmark archive: it presents individual model runs as readable reports with direct access to execution transcripts and source result artifacts, rather than reducing them to a promotional leaderboard.

## Operating Context

Benchmark operators use a Linux host with Docker, Harbor, Pi, and a model served by LM Studio. The launcher discovers a loaded model, runs a Harbor task through Pi, and writes job, trial, verifier, and session artifacts beneath `jobs/`.

The public viewer is served as a static website. It reads the append-only `jobs.jsonl` index, loads result and session artifacts directly from `jobs/`, supports search, and progressively exposes transcript and raw-result evidence.

## Capabilities and Constraints

- The viewer MUST remain a static, no-build web application using plain HTML, CSS, and JavaScript.
- It MUST work when served by a basic HTTP server; `file://` operation is unsupported because browser fetch restrictions prevent artifact loading.
- Run records may be complete, pending, failed, unavailable, malformed, or partially published. The viewer must represent these states honestly.
- Search is the only confirmed persistent control. The archive is a linear run list, not an aggregate analytics dashboard.
- Harbor appends index records after agent runs. Result and session files remain the source evidence behind each report.
- The current launcher and benchmark-generation workflow remain supporting infrastructure, not the primary public reading experience.

## Evidence on Hand

- `jobs.jsonl` contains indexed trial metadata used by the viewer.
- `jobs/` contains generated job results, trial results, verifier output, and Pi session exports.
- A completed SSH key-pair benchmark run is present under `jobs/2026-07-22__20-02-12/` with a score of `1.0` and an exported session.
- `README.md` documents setup, runtime flow, requirements, report serving, and artifact layout.
- No customer claims, testimonials, comparative leaderboard claims, logos, proprietary fonts, or external brand assets are present.

## Product Principles

1. Lead with the run result, model, task, score, status, and time.
2. Keep every conclusion traceable to transcript or raw result evidence.
3. Make reports understandable without prior knowledge of Harbor, Pi, LM Studio, or repository structure.
4. Represent missing, malformed, pending, and failed data explicitly rather than hiding it.
5. Preserve a focused archive experience; add controls or aggregate views only when observed reader needs justify them.

## Accessibility & Inclusion

The public archive MUST support semantic HTML, keyboard navigation, visible focus, strong contrast, status cues that do not depend on color, and reduced-motion preferences. Labels and explanations must remain understandable to readers unfamiliar with the benchmarking toolchain.
