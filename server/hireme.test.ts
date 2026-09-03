import { describe, expect, it } from "vitest";
import { auditOutputs, buildEvidenceMatrix, makeAnalysis, normalizeJob, normalizeResume, safeFileName, type ExtractedDocument } from "../shared/hireme";

const job: ExtractedDocument = { kind: "job", fileName: "job.txt", mimeType: "text/plain", provenance: "txt", warnings: [], text: "Operations Manager\nCompany: Northstar\n- Lead operations and improve service quality\n- Use Excel and CRM systems\n- Manage stakeholder priorities", sourceSpans: [] };
const resume: ExtractedDocument = { kind: "resume", fileName: "resume.txt", mimeType: "text/plain", provenance: "txt", warnings: [], text: "Jordan Lee\nOperations Manager\n- Led operations and improved service quality\n- Used Excel reporting and CRM systems", sourceSpans: [] };

describe("HireMe evidence engine", () => {
  it("normalizes both source documents without guessing missing values", () => {
    expect(normalizeJob(job).employer).toBe("Northstar");
    expect(normalizeResume(resume).candidateName).toBe("Jordan Lee");
    expect(normalizeResume(resume).contact).toBeNull();
  });

  it("builds a tailored matrix whose maximum score is exactly 100", () => {
    const matrix = buildEvidenceMatrix(normalizeJob(job), normalizeResume(resume));
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.reduce((sum, row) => sum + row.maximumScore, 0)).toBe(100);
    expect(matrix.every((row) => ["Explicit", "Strongly implied", "Weakly implied", "Absent"].includes(row.evidenceGrade))).toBe(true);
  });

  it("generates both artifacts from the same matrix and preserves provenance", () => {
    const result = makeAnalysis(job, resume);
    expect(result.assessment).toContain("not a probability of hiring");
    expect(result.studyGuide).toContain("Central message");
    expect(result.job.sourceSpans.length).toBeGreaterThan(0);
    expect(result.resume.sourceSpans.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("flags unsupported numeric claims and sanitizes filenames", () => {
    const result = makeAnalysis(job, resume);
    const audit = auditOutputs(result.matrix, `${result.assessment} 99%`, result.studyGuide, result.score);
    expect(audit.warnings.some((warning) => warning.includes("99%"))).toBe(true);
    expect(safeFileName("Jo/rdan Lee", "Ops: Manager", "Assessment.md")).toBe("Jo_rdan_Lee_Ops_Manager_Assessment.md");
  });
});

import { extractDocument } from "./documentExtraction";
import { validateProviderConfiguration } from "./providerAdapters";

describe("HireMe adapters", () => {
  it("accepts local providers without an API key and rejects remote providers without one", () => {
    expect(validateProviderConfiguration({ provider: "ollama", model: "llama3", temperature: 0.2, maxTokens: 1000, streaming: false }).ok).toBe(true);
    expect(validateProviderConfiguration({ provider: "openai", model: "gpt-4o", temperature: 0.2, maxTokens: 1000, streaming: false }).ok).toBe(false);
  });

  it("extracts TXT bytes with provenance and rejects unsupported files", async () => {
    const extracted = await extractDocument({ kind: "resume", fileName: "resume.txt", mimeType: "text/plain", base64: Buffer.from("Jordan Lee\\nOperations Manager").toString("base64") });
    expect(extracted.text).toContain("Jordan Lee");
    expect(extracted.sourceSpans[0]?.source).toBe("resume");
    await expect(extractDocument({ kind: "job", fileName: "job.exe", mimeType: "application/octet-stream", base64: "ZmFrZQ==" })).rejects.toThrow("Unsupported file type");
  });
});
