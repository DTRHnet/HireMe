# HireMe Implementation Plan

## Product boundary

HireMe accepts exactly two primary source inputs: one job description and one candidate resume. Each input may be pasted or supplied as a PDF, DOCX, or TXT file through drag-and-drop or file selection. No third analysis document or auxiliary profile is accepted.

## Architecture

The existing full-stack TypeScript application remains the runtime foundation. Domain logic will live in server-side, typed feature modules with explicit stage contracts:

`RawInput → ExtractedDocument → NormalizedDocument → EvidenceMatrix → AnalysisOutputs → Audit → Export`

The browser will manage composition, inspection, consent, and presentation. Provider calls and secret handling remain server-side. The authoritative HireMe methodology will be copied unchanged into `reference/hireme-skill/` and treated as read-only reference material.

## Analysis strategy

Deterministic validation, extraction, provenance retention, normalization, date handling, score arithmetic, filename sanitization, and audit checks will be implemented independently of provider transport. LLM use will be staged: validation warnings, structured evidence matrix, assessment, study guide, and consistency audit. Generated artifacts will be derived from the shared evidence matrix, and critical audit failures will block export.

Evidence grades are exactly `Explicit`, `Strongly implied`, `Weakly implied`, and `Absent`. The score is a tailored documented-fit heuristic out of 100, never a hiring probability. Missing information remains a labeled evidence gap.

## Privacy and persistence

Analysis is user-initiated and will display a privacy notice before provider transmission. Local-first history and settings controls will be explicit. Provider API keys will never be rendered to the client or persisted as plaintext in application records. Remote-provider usage will be clearly labeled; local providers will be identified as local.

## UI direction

Use a typographic brutalist system: stark black and white, oversized heavy sans-serif type, rigid thick rules, bracket motifs, underlines, asymmetric grids, and abundant negative space. Preserve semantic headings, focus states, keyboard access, mobile-safe horizontal scrolling for the matrix, and actionable empty/error/loading states.

## Implementation order

1. Create typed domain models and deterministic document/analysis utilities.
2. Add server procedures and persistence required for analysis history and provider settings without storing plaintext keys.
3. Build the two-input Analyze workspace and staged progress states.
4. Build results inspection, audit gating, history/settings/about, and unchanged skill download.
5. Add Markdown, JSON, CSV, PDF, and practical DOCX exports.
6. Add unit/integration/security tests, validate the complete synthetic flow, run typecheck/lint/test/build, and inspect desktop/mobile screenshots.
