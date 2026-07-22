---
name: LLM Benchmark Archive
description: A forensic editorial system for readable, inspectable benchmark evidence.
colors:
  carbon-field: "#0a0d0e"
  evidence-surface: "#121718"
  evidence-surface-strong: "#192021"
  rule-line: "#303a3b"
  evidence-paper: "#f0eee7"
  secondary-evidence: "#aeb7b5"
  signal-amber: "#e2b85b"
  verified-green: "#7fd0a1"
  pending-blue: "#89bde2"
  failure-red: "#ef9994"
  unavailable-rose: "#c8aaaa"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(4.5rem, 12vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.78
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.08em"
  data:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0px"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.75rem"
  lg: "2.5rem"
  xl: "4rem"
components:
  search-field:
    backgroundColor: "transparent"
    textColor: "{colors.evidence-paper}"
    rounded: "{rounded.none}"
    height: "3rem"
    padding: "0.5rem 0"
  report-row:
    backgroundColor: "transparent"
    textColor: "{colors.evidence-paper}"
    rounded: "{rounded.none}"
    padding: "2rem 1rem"
  task-card:
    backgroundColor: "{colors.evidence-surface}"
    textColor: "{colors.evidence-paper}"
    rounded: "{rounded.none}"
    padding: "1.75rem"
  secondary-button:
    backgroundColor: "{colors.evidence-surface}"
    textColor: "{colors.evidence-paper}"
    rounded: "{rounded.none}"
    padding: "0.625rem 1rem"
---

# Design System: LLM Benchmark Archive

## Overview

**Creative North Star: "The Evidence Ledger"**

The interface behaves like a public record: claims appear first, supporting evidence remains directly inspectable, and every visual decision reinforces credibility. Its forensic editorial voice combines an oversized condensed headline with compact technical metadata, hard rules, and deliberate empty space.

The system is quiet but not timid. Signal Amber creates one controlled point of emphasis; status colors communicate state without replacing explicit labels. Decoration is rejected unless it improves orientation or evidence reading.

**Key Characteristics:**
- Evidence-first hierarchy with one strong editorial focal point.
- Flat, square-edged surfaces separated by rules and tonal shifts.
- Condensed display typography paired with readable sans-serif body copy.
- Monospace reserved for identifiers, measurements, dates, and source metadata.
- Motion used only to orient readers during entry and disclosure.

## Colors

The palette uses Carbon Field and Evidence Paper as the dominant reading environment, with Signal Amber reserved for navigation, focus, and decisive emphasis.

### Primary
- **Signal Amber:** Used sparingly for the hero emphasis, focus rings, disclosure indicators, and score rules.

### Secondary
- **Verified Green:** Successful job and task states.
- **Pending Blue:** Pending or incomplete work when that state appears.
- **Failure Red:** Failed and errored states.
- **Unavailable Rose:** Missing or unavailable evidence.

### Neutral
- **Carbon Field:** Page background and deepest canvas.
- **Evidence Surface:** Task blocks and interactive tonal feedback.
- **Evidence Surface Strong:** Loading placeholders and stronger nested surfaces.
- **Rule Line:** Dividers, outlines, and quiet control borders.
- **Evidence Paper:** Primary text and high-importance values.
- **Secondary Evidence:** Explanations, labels, metadata, and unavailable detail.

**The Signal Rarity Rule.** Signal Amber should occupy a small minority of the page; its scarcity gives it authority.

**The Explicit Status Rule.** Color may reinforce state, but every state must remain understandable from text and shape alone.

## Typography

**Display Font:** Barlow Condensed (sans-serif fallback)
**Body Font:** IBM Plex Sans (sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono (monospace fallback)

**Character:** Barlow Condensed gives the archive a decisive editorial masthead and compact report titles. IBM Plex Sans keeps explanations neutral and readable; IBM Plex Mono identifies evidence rather than performing a generic technical aesthetic.

### Hierarchy
- **Display** (800, 4.5–6rem, 0.78): Page identity only.
- **Title** (700, 1.5rem, 1): Job and task identifiers.
- **Body** (400, 1rem, 1.5): Explanations and report prose, generally capped near 65–75 characters.
- **Label** (700, 0.75rem, 0.08em, uppercase): Statuses, metadata terms, and compact controls.
- **Data** (400, 0.875rem, 1.5): Models, timestamps, counts, paths, and measured values.

**The Evidence Mono Rule.** Use monospace only when content is an identifier, path, timestamp, count, measurement, or raw value.

## Layout

The page uses a centered 70rem maximum-width canvas with narrow responsive gutters. The header becomes an asymmetric two-column composition at medium widths, while report rows use a result-first grid: identity and metadata take the flexible column, score takes a fixed evidence column, and disclosure remains a small final control.

Spacing alternates between tight evidence groups and generous section breaks. Mobile layouts stack descriptions and scores without hiding functionality. Breakpoints follow the implemented 640px and 768px transitions.

**The Linear Archive Rule.** Preserve one searchable chronological report stream; do not convert the archive into a card dashboard or aggregate leaderboard without new product evidence.

## Elevation & Depth

The system is flat by design and uses no shadows. Depth comes from tonal surface changes, one-pixel rules, disclosure, and whitespace. Hover states may reveal the Evidence Surface tone but must not simulate floating cards.

**The Flat Evidence Rule.** Borders and tonal layers carry structure; decorative shadows and glows do not belong.

## Shapes

Corners remain square. Chips, controls, task blocks, and report rows use hard rectangular geometry with one-pixel borders. Small chevrons and rule lines provide directional movement; ornamental silhouettes are absent.

## Components

### Buttons
- **Shape:** Square, outlined rectangle.
- **Secondary:** Evidence Surface background, Evidence Paper text, compact horizontal padding.
- **Hover / Focus:** Border and text shift to Signal Amber; focus receives a visible two-pixel amber ring with dark offset.

### Chips
- **Style:** Transparent background, one-pixel semantic border, compact monospace text.
- **State:** Status labels always include readable text; environment chips use Signal Amber as supporting evidence.

### Cards / Containers
- **Corner Style:** Square.
- **Background:** Evidence Surface for nested task records; report rows remain on Carbon Field.
- **Shadow Strategy:** None.
- **Border:** One-pixel Rule Line.
- **Internal Padding:** 1.25rem on mobile and 1.75rem from small screens upward.

### Inputs / Fields
- **Style:** Transparent field with a two-pixel bottom rule rather than a boxed input.
- **Focus:** Bottom rule changes to Signal Amber with no glow.
- **Disabled / Error:** Preserve readable text and use explicit status copy.

### Benchmark Report Row
- **Structure:** Status, job identifier, and environment form the first line; model, trial count, and timestamp form the evidence line; score remains isolated by an amber rule.
- **Disclosure:** Native details/summary behavior with an amber chevron and full keyboard support.

## Do's and Don'ts

### Do:
- **Do** lead with job status, identity, score, model, and time before paths or raw metadata.
- **Do** use hard rules, tonal shifts, and whitespace to separate evidence.
- **Do** keep focus visible and status understandable without color.
- **Do** use brief exponential entrance and disclosure motion only for orientation.
- **Do** retain the asymmetric editorial header as the primary visual signature.

### Don't:
- **Don't** add gradients, glass effects, neon accents, decorative charts, or generic dashboard cards.
- **Don't** use Signal Amber as a large background field or routine body-text color.
- **Don't** introduce rounded containers or shadows that imply floating surfaces.
- **Don't** use monospace for ordinary prose or headings.
- **Don't** let visual drama obscure provenance, failures, missing data, or keyboard access.
