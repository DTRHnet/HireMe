# Project TODO

- [x] Exactly two source inputs: job description and candidate resume
- [x] Paste, drag-and-drop, and PDF/DOCX/TXT upload flows for both inputs (server extraction for PDF/DOCX)
- [x] Text extraction provenance and actionable extraction warnings (page-aware PDF warnings; source-span references)
- [x] Input validation and typed canonical job/resume records
- [x] Job requirement parsing
- [x] Resume evidence inventory
- [x] Shared evidence matrix with four evidence grades
- [x] Transparent documented-fit 100-point heuristic with deductions
- [x] Cross-document consistency audit grounded only in source evidence
- [x] User-initiated analysis flow with visible privacy notice and consent state
- [ ] Configurable OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio, and generic OpenAI-compatible adapters
- [ ] Provider/model settings persisted securely server-side
- [x] Resume Fit Assessment derived from audited evidence matrix
- [x] Interview Study Guide derived from audited evidence matrix
- [x] Analysis history, loading/error/retry states, privacy controls, and deletion
- [x] Result inspection for assessment, study guide, matrix, normalized JSON, and full analysis JSON
- [x] Markdown, PDF, practical DOCX, JSON, and evidence-matrix CSV exports
- [x] Download HireMe Skill action serving the supplied original package unchanged
- [x] Typographic brutalist responsive accessible workspace UI
- [x] Unit and integration tests for validation, normalization, evidence, scoring, and audit
- [x] Type checking, production build, and synthetic end-to-end validation
- [x] Verify no provider API keys leak to client output

# Follow-up implementation gaps

- [ ] Wire selected remote providers to real server-side staged LLM adapters rather than the deterministic baseline.
- [ ] Add provider/model/endpoint controls and secure non-plaintext credential handling for remote connections.
- [x] Add runtime Zod validation for evidence matrix and audit result; typed extraction/provider inputs
- [ ] Expand consistency audit to candidate identity, role, employer, credentials, evidence claims, gaps, and recommendation alignment.
- [x] Add actionable file extraction error recovery state
- [ ] Add real PDF/DOCX integration tests and document extraction failure-path tests.
- [ ] Add PDF and practical DOCX export generation; keep JSON/Markdown/CSV exports available.
- [ ] Verify the downloaded skill archive byte-for-byte against the supplied original archive when an original archive is supplied.
- [ ] Perform documented browser end-to-end validation, including client-bundle secret scanning and history reopen flow.
