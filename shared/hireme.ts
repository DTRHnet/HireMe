export type InputKind = "job" | "resume";
export type EvidenceGrade = "Explicit" | "Strongly implied" | "Weakly implied" | "Absent";
export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter" | "ollama" | "lmstudio" | "compatible";

export type SourceSpan = {
  id: string;
  source: InputKind;
  section: string | null;
  page: number | null;
  text: string;
  start: number;
  end: number;
};

export type ExtractedDocument = {
  kind: InputKind;
  fileName: string | null;
  mimeType: string | null;
  text: string;
  provenance: "pasted" | "txt" | "pdf" | "docx";
  warnings: string[];
  sourceSpans: SourceSpan[];
};

export type Requirement = {
  id: string;
  text: string;
  category: string;
  mandatory: boolean;
  sourceSpanId: string | null;
};

export type EvidenceItem = {
  text: string;
  category: string;
  sourceSpanId: string | null;
  originalDate: string | null;
};

export type NormalizedJob = {
  title: string | null;
  employer: string | null;
  location: string | null;
  responsibilities: Requirement[];
  mandatoryRequirements: Requirement[];
  preferredRequirements: Requirement[];
  certifications: Requirement[];
  education: Requirement[];
  systems: Requirement[];
  regulations: Requirement[];
  leadershipExpectations: Requirement[];
  operationalExpectations: Requirement[];
  keywords: string[];
  rawText: string;
  sourceSpans: SourceSpan[];
};

export type NormalizedResume = {
  candidateName: string | null;
  contact: { email: string | null; phone: string | null; location: string | null } | null;
  summary: string | null;
  education: EvidenceItem[];
  registrations: EvidenceItem[];
  certifications: EvidenceItem[];
  skills: EvidenceItem[];
  systems: EvidenceItem[];
  employmentHistory: { role: string; employer: string | null; dates: string | null; bullets: EvidenceItem[] }[];
  leadership: EvidenceItem[];
  operations: EvidenceItem[];
  qualityImprovement: EvidenceItem[];
  stakeholderExperience: EvidenceItem[];
  rawText: string;
  sourceSpans: SourceSpan[];
};

export type EvidenceReference = { sourceSpanId: string; quote: string };
export type EvidenceRow = {
  id: string;
  requirement: string;
  category: string;
  mandatory: boolean;
  weight: number;
  resumeEvidence: EvidenceReference[];
  evidenceGrade: EvidenceGrade;
  transferability: string;
  gapOrAmbiguity: string | null;
  earnedScore: number;
  maximumScore: number;
  interviewImplication: string;
};

export type AuditResult = { status: "passed" | "blocked"; critical: string[]; warnings: string[] };
import { z } from "zod";

export const evidenceGradeSchema = z.enum(["Explicit", "Strongly implied", "Weakly implied", "Absent"]);
export const sourceSpanSchema = z.object({ id: z.string(), source: z.enum(["job", "resume"]), section: z.string().nullable(), page: z.number().nullable(), text: z.string(), start: z.number(), end: z.number() });
export const evidenceRowSchema = z.object({ id: z.string(), requirement: z.string(), category: z.string(), mandatory: z.boolean(), weight: z.number().nonnegative(), resumeEvidence: z.array(z.object({ sourceSpanId: z.string(), quote: z.string() })), evidenceGrade: evidenceGradeSchema, transferability: z.string(), gapOrAmbiguity: z.string().nullable(), earnedScore: z.number().nonnegative(), maximumScore: z.number().nonnegative(), interviewImplication: z.string() });
export const auditResultSchema = z.object({ status: z.enum(["passed", "blocked"]), critical: z.array(z.string()), warnings: z.array(z.string()) });
export const normalizedJobSchema = z.object({ title: z.string().nullable(), employer: z.string().nullable(), location: z.string().nullable(), responsibilities: z.array(z.any()), mandatoryRequirements: z.array(z.any()), preferredRequirements: z.array(z.any()), certifications: z.array(z.any()), education: z.array(z.any()), systems: z.array(z.any()), regulations: z.array(z.any()), leadershipExpectations: z.array(z.any()), operationalExpectations: z.array(z.any()), keywords: z.array(z.string()), rawText: z.string(), sourceSpans: z.array(sourceSpanSchema) });
export const normalizedResumeSchema = z.object({ candidateName: z.string().nullable(), contact: z.any().nullable(), summary: z.string().nullable(), education: z.array(z.any()), registrations: z.array(z.any()), certifications: z.array(z.any()), skills: z.array(z.any()), systems: z.array(z.any()), employmentHistory: z.array(z.any()), leadership: z.array(z.any()), operations: z.array(z.any()), qualityImprovement: z.array(z.any()), stakeholderExperience: z.array(z.any()), rawText: z.string(), sourceSpans: z.array(sourceSpanSchema) });

export type AnalysisResult = {
  id: string;
  job: NormalizedJob;
  resume: NormalizedResume;
  matrix: EvidenceRow[];
  score: number;
  assessment: string;
  studyGuide: string;
  audit: AuditResult;
  provider: string;
  model: string;
  createdAt: number;
};

const STOP_WORDS = new Set("the and for with from that this are you your our will have has into about role job work team using through their they as an in of to a on or be is by at it not we".split(" "));
const KEY_TERMS = /[A-Za-z][A-Za-z0-9+#./-]{2,}/g;

function spans(kind: InputKind, text: string): SourceSpan[] {
  return text.split(/\n+/).map((line, i) => ({ id: `${kind}-span-${i + 1}`, source: kind, section: null, page: null, text: line.trim(), start: text.indexOf(line), end: text.indexOf(line) + line.length })).filter((s) => s.text.length > 0);
}

export function extractText(kind: InputKind, input: { text?: string; file?: File | null }): Promise<ExtractedDocument> {
  if (input.text?.trim()) return Promise.resolve({ kind, fileName: null, mimeType: "text/plain", text: input.text.trim(), provenance: "pasted", warnings: [], sourceSpans: spans(kind, input.text.trim()) });
  const file = input.file;
  if (!file) return Promise.resolve({ kind, fileName: null, mimeType: null, text: "", provenance: "pasted", warnings: ["No source supplied. Paste text or choose a supported file."], sourceSpans: [] });
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "txt" || file.type === "text/plain") return file.text().then((text) => ({ kind, fileName: file.name, mimeType: file.type || "text/plain", text: text.trim(), provenance: "txt", warnings: text.trim() ? [] : ["The TXT file is empty."], sourceSpans: spans(kind, text.trim()) }));
  const provenance = ext === "pdf" ? "pdf" : "docx";
  return Promise.resolve({ kind, fileName: file.name, mimeType: file.type || null, text: "", provenance, warnings: [`${ext?.toUpperCase()} extraction needs a server document adapter. The file is recognized, but no text was guessed. Upload a text-readable file or enable the document adapter before analysis.`], sourceSpans: [] });
}

function firstMatch(text: string, patterns: RegExp[]): string | null { for (const p of patterns) { const m = text.match(p); if (m?.[1]) return m[1].trim(); } return null; }
function items(lines: string[], category: string, source: SourceSpan[]): EvidenceItem[] { return lines.filter(Boolean).slice(0, 12).map((text) => ({ text, category, sourceSpanId: source.find((s) => s.text === text)?.id ?? null, originalDate: text.match(/\b(?:19|20)\d{2}\b(?:\s*[-–]\s*(?:present|\d{4}))?/i)?.[0] ?? null })); }
function bulletLines(text: string): string[] { return text.split(/\n+/).map((x) => x.replace(/^\s*[-•*▪]\s*/, "").trim()).filter((x) => x.length > 12); }
function requirements(text: string, source: SourceSpan[]): Requirement[] { return bulletLines(text).slice(0, 24).map((line, i) => ({ id: `req-${i + 1}`, text: line, category: /lead|manage|supervis|director|coach/i.test(line) ? "Leadership" : /system|software|platform|excel|sql|crm/i.test(line) ? "Systems" : /degree|certif|license|registration/i.test(line) ? "Credentials" : /budget|process|operation|quality|project|stakeholder/i.test(line) ? "Operations" : "Core requirement", mandatory: /required|must|minimum|essential/i.test(line), sourceSpanId: source.find((s) => s.text === line)?.id ?? null })); }

export function normalizeJob(doc: ExtractedDocument): NormalizedJob {
  const text = doc.text;
  const source = doc.sourceSpans;
  const reqs = requirements(text, source);
  const title = firstMatch(text, [/^(?:title|position|role)\s*:\s*(.+)$/im, /(?:seeking|hiring)\s+(?:a|an)?\s*([^\n.]+)/i]);
  const employer = firstMatch(text, [/^(?:company|employer|organization)\s*:\s*(.+)$/im, /(?:at|join)\s+([A-Z][A-Za-z0-9 &.-]{2,40})/]);
  const words = (text.match(KEY_TERMS) ?? []).map((x) => x.toLowerCase()).filter((x) => !STOP_WORDS.has(x));
  const keywords = Array.from(new Set(words)).slice(0, 40);
  const by = (cat: string) => reqs.filter((r) => r.category === cat);
  return { title, employer, location: firstMatch(text, [/^(?:location|based in)\s*:\s*(.+)$/im]), responsibilities: reqs, mandatoryRequirements: reqs.filter((r) => r.mandatory), preferredRequirements: reqs.filter((r) => !r.mandatory), certifications: by("Credentials").filter((r) => /certif|license|registration/i.test(r.text)), education: by("Credentials").filter((r) => /degree|education|bachelor|master/i.test(r.text)), systems: by("Systems"), regulations: reqs.filter((r) => /regulat|compliance|law|policy|privacy|safety/i.test(r.text)), leadershipExpectations: by("Leadership"), operationalExpectations: by("Operations"), keywords, rawText: text, sourceSpans: source };
}

export function normalizeResume(doc: ExtractedDocument): NormalizedResume {
  const text = doc.text; const source = doc.sourceSpans; const lines = bulletLines(text);
  const name = text.split(/\n/).map((x) => x.trim()).find((x) => x && x.length < 70 && !/@|resume|curriculum vitae/i.test(x)) ?? null;
  const contact = { email: text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? null, phone: text.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0] ?? null, location: firstMatch(text, [/^(?:location|based in)\s*:\s*(.+)$/im]) };
  const employment = lines.filter((x) => /\b(?:19|20)\d{2}\b/.test(x)).slice(0, 8).map((x) => ({ role: x.replace(/\s*\|.*$/, ""), employer: null, dates: x.match(/\b(?:19|20)\d{2}\b.*$/)?.[0] ?? null, bullets: [] }));
  return { candidateName: name, contact: contact.email || contact.phone || contact.location ? contact : null, summary: text.split(/\n\n/)[0]?.trim() ?? null, education: items(lines.filter((x) => /degree|bachelor|master|college|university/i.test(x)), "Education", source), registrations: items(lines.filter((x) => /registration|licensed|licen[cs]e/i.test(x)), "Registration", source), certifications: items(lines.filter((x) => /certif/i.test(x)), "Certification", source), skills: items(lines.filter((x) => /skill|proficient|experienced in/i.test(x)), "Skill", source), systems: items(lines.filter((x) => /software|system|platform|excel|sql|crm|ehr/i.test(x)), "System", source), employmentHistory: employment, leadership: items(lines.filter((x) => /lead|manage|supervis|coach|director/i.test(x)), "Leadership", source), operations: items(lines.filter((x) => /operat|process|budget|project|workflow/i.test(x)), "Operations", source), qualityImprovement: items(lines.filter((x) => /quality|improv|audit|metric|outcome/i.test(x)), "Quality", source), stakeholderExperience: items(lines.filter((x) => /stakeholder|partner|client|customer|community/i.test(x)), "Stakeholder", source), rawText: text, sourceSpans: source };
}

function grade(req: Requirement, resumeText: string, resumeSource: SourceSpan[]): { grade: EvidenceGrade; score: number; evidence: EvidenceReference[] } { const terms = (req.text.match(KEY_TERMS) ?? []).map((x) => x.toLowerCase()).filter((x) => !STOP_WORDS.has(x)); const lower = resumeText.toLowerCase(); const hits = terms.filter((x) => lower.includes(x)); const quote = resumeText.split(/\n+/).find((line) => hits.some((hit) => line.toLowerCase().includes(hit)))?.trim() ?? ""; const quoteSpan = resumeSource.find((span) => span.text === quote); if (hits.length >= Math.max(2, Math.ceil(terms.length * 0.45))) return { grade: "Explicit", score: 1, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; if (hits.length >= 2) return { grade: "Strongly implied", score: 0.7, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; if (hits.length === 1) return { grade: "Weakly implied", score: 0.35, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; return { grade: "Absent", score: 0, evidence: [] }; }

export function buildEvidenceMatrix(job: NormalizedJob, resume: NormalizedResume): EvidenceRow[] { const reqs = job.responsibilities.length ? job.responsibilities : [{ id: "req-core", text: "Demonstrated alignment with the role's stated responsibilities", category: "Core requirement", mandatory: true, sourceSpanId: null }]; const weights = reqs.map((_, i) => Math.floor(100 / reqs.length) + (i < 100 % reqs.length ? 1 : 0)); return reqs.map((req, i) => { const g = grade(req, resume.rawText, resume.sourceSpans); const max = weights[i] ?? 0; return { id: req.id, requirement: req.text, category: req.category, mandatory: req.mandatory, weight: max, resumeEvidence: g.evidence, evidenceGrade: g.grade, transferability: g.grade === "Explicit" ? "Direct evidence is documented in the supplied resume." : g.grade === "Absent" ? "No defensible transfer claim can be made from the supplied resume." : "Adjacent evidence may transfer, but direct ownership is not established.", gapOrAmbiguity: g.grade === "Absent" ? "The supplied resume does not establish this criterion." : g.grade === "Explicit" ? null : "Scope, recency, or direct ownership requires interview clarification.", earnedScore: Math.round(max * g.score), maximumScore: max, interviewImplication: g.grade === "Explicit" ? "Emphasize the exact example and its verified scope." : "Prepare a bounded process answer and do not overclaim." }; }); }

export function auditOutputs(matrix: EvidenceRow[], assessment: string, guide: string, score: number, identity?: { candidate: string | null; role: string | null; employer: string | null }): AuditResult { const critical: string[] = []; const warnings: string[] = []; if (identity?.candidate && !assessment.includes(identity.candidate) && !guide.includes(identity.candidate)) warnings.push("Candidate identity is not repeated in generated artifacts; confirm metadata before export."); if (identity?.role && !assessment.toLowerCase().includes(identity.role.toLowerCase())) warnings.push("Target role is not repeated in the assessment; confirm metadata before export."); if (identity?.employer && !assessment.toLowerCase().includes(identity.employer.toLowerCase())) warnings.push("Employer is not repeated in the assessment; confirm metadata before export."); const combined = `${assessment}\n${guide}`; const numbers = combined.match(/\b\d+(?:\.\d+)?%?|\$\d+[\d,]*/g) ?? []; for (const n of numbers) { if (!matrix.some((row) => row.resumeEvidence.some((e) => e.quote.includes(n)))) warnings.push(`Metric ${n} appears in generated text without a matching evidence quote.`); } if (matrix.reduce((a, r) => a + r.maximumScore, 0) !== 100) critical.push("Evidence matrix maximum score does not total 100."); if (score < 0 || score > 100) critical.push("Documented-fit score is outside the 0–100 range."); return { status: critical.length ? "blocked" : "passed", critical, warnings }; }

export function generateAssessment(job: NormalizedJob, matrix: EvidenceRow[], score: number): string { const strong = matrix.filter((r) => r.evidenceGrade === "Explicit").slice(0, 3); const gaps = matrix.filter((r) => r.evidenceGrade === "Absent").slice(0, 3); return `# Resume Fit Assessment\n\n## 1. Executive assessment\n\n**Documented-fit score: ${score}/100.** This score reflects visible evidence in the supplied resume compared with the supplied posting; it is not a probability of hiring.\n\nThe strongest documented alignments are ${strong.length ? strong.map((r) => r.requirement).join(", ") : "not yet established"}. The largest evidence gaps are ${gaps.length ? gaps.map((r) => r.requirement).join(", ") : "not material in the current matrix"}.\n\n> **Bottom line**\n> The central interview burden is to connect the documented evidence to the role's scope while answering missing-detail questions without inventing facts.\n\n## 2. Weighted scoring rubric\n\n| Area | Weight | Score | Assessment |\n|---|---:|---:|---|\n${matrix.map((r) => `| ${r.requirement} | ${r.maximumScore} | ${r.earnedScore} | ${r.evidenceGrade}; ${r.gapOrAmbiguity ?? "direct evidence documented"} |`).join("\n")}\n\n## 3. Detailed fit analysis\n\n${matrix.map((r, i) => `### 3.${i + 1} ${i + 1}. ${r.requirement} — ${r.earnedScore}/${r.maximumScore}\n\n**Evidence grade:** ${r.evidenceGrade}. ${r.resumeEvidence[0] ? `The resume evidence reads: “${r.resumeEvidence[0].quote}”` : "The supplied resume does not provide a supporting quote."} ${r.gapOrAmbiguity ?? "No material gap is recorded."}\n\n**Interview emphasis:** ${r.interviewImplication}`).join("\n\n")}\n\n## 4. Key strengths to emphasize\n\n${strong.length ? strong.map((r) => `- **${r.requirement}:** ${r.resumeEvidence[0]?.quote ?? "Documented evidence is present."}`).join("\n") : "No criterion currently reaches the Explicit grade."}\n\n## 5. Main interview risks and how to manage them\n\n${gaps.length ? gaps.map((r) => `- **Panel question:** You have not documented ${r.requirement}. **Response strategy:** acknowledge the boundary, state transferable evidence only if accurate, describe a sound process, and identify when to consult the appropriate expert.`).join("\n") : "The panel should still verify scope, recency, and ownership for each major criterion."}\n\n## 6. Interview-ready positioning statement\n\nI would position my experience around the responsibilities I can document directly, explain the scope of those examples clearly, and be candid about areas that require clarification. I would connect my evidence to the role's priorities without turning adjacent experience into a claim of direct ownership.\n\n## 7. Final recommendation\n\n**Credible fit with clarification areas.** The recommendation should be revisited after the candidate confirms the largest evidence gaps and role scope.\n\n## 8. Immediate preparation checklist\n\nConfirm the scope and recency of each Explicit or Strongly implied example, prepare one accurate story for the largest gaps, and replace every placeholder with verified personal history before use.\n\n## 9. Method and source note\n\nSources: supplied job description and supplied candidate resume. The score reflects visible evidence in those materials. All examples, metrics, dates, and claims require correction to the candidate's accurate history.`; }

export function generateStudyGuide(job: NormalizedJob, matrix: EvidenceRow[]): string { const gaps = matrix.filter((r) => r.evidenceGrade === "Absent").slice(0, 4); return `# Interview Study Guide\n\n> **Central message**\n> Speak from the evidence you can verify. Use adjacent experience as transferability, not as direct ownership.\n\n## What the panel is likely looking for\n\nThe panel is likely to test the role requirements, the scope of examples, decision-making process, stakeholder communication, and how you handle evidence gaps.\n\n## Your strongest fit with the posting\n\n| Requirement or responsibility | Evidence from your resume | How to position it |\n|---|---|---|\n${matrix.filter((r) => r.evidenceGrade !== "Absent").slice(0, 8).map((r) => `| ${r.requirement} | ${r.resumeEvidence[0]?.quote ?? "Evidence requires confirmation"} | Explain the verified scope and outcome; do not add unsupported detail. |`).join("\n")}\n\n## 60–90 second opening answer\n\nI would start by connecting my documented experience to the responsibilities named in this posting. I would give one or two verified examples, explain the scope I personally owned, and identify where I am preparing to learn or clarify the environment.\n\n## Keywords to use naturally\n\n${Array.from(new Set(matrix.flatMap((r) => r.requirement.match(KEY_TERMS) ?? []))).slice(0, 18).join(", ")}\n\n## Topics to review before the interview\n\nReview the role's systems, regulations, operating concepts, and any requirement graded Absent. Review is not evidence of prior expertise.\n\n## Adaptable STAR story bank\n\nPrepare stories anchored in your actual roles. For each story, write Situation, Task, Action, Result, and Lesson; use [confirm metric] where the source materials do not provide a number.\n\n## Mock interview questions and answer focus\n\n| Question | What the panel wants to hear |\n|---|---|\n${matrix.slice(0, 8).map((r) => `| Tell us about your experience with ${r.requirement}. | A concise example, your role, verified scope, and an honest boundary statement. |`).join("\n")}\n\n## Suggested answers to challenging areas\n\n${gaps.length ? gaps.map((r) => `**${r.requirement}** — I have not documented direct ownership of this exact area in the supplied resume. I can describe the adjacent experience I can verify, explain the process I would follow, and identify when I would consult the appropriate expert.`).join("\n\n") : "No Absent criteria are currently recorded; still verify every claim before speaking."}\n\n## Questions to ask the panel\n\nAsk about first-priority outcomes, success measures, decision rights, onboarding, team or service challenges, and how the organization defines strong performance.\n\n## Same-day preparation schedule\n\nBlock time for the opening answer, two accurate stories, technical review, role vocabulary, logistics, and a final evidence check.\n\n## Final rapid-review checklist\n\nSpeak naturally, protect confidential information, label gaps honestly, and verify every metric, date, credential, and outcome.\n\n## Closing statement and Source note\n\nI would close by restating the documented value I can bring, naming the areas I am prepared to clarify, and thanking the panel. This guide uses only the supplied job description, resume, and shared evidence matrix.`; }

export function makeAnalysis(jobDoc: ExtractedDocument, resumeDoc: ExtractedDocument, provider = "Local deterministic", model = "Evidence-first baseline"): AnalysisResult { const jobInput = jobDoc.sourceSpans.length ? jobDoc : { ...jobDoc, sourceSpans: spans("job", jobDoc.text) }; const resumeInput = resumeDoc.sourceSpans.length ? resumeDoc : { ...resumeDoc, sourceSpans: spans("resume", resumeDoc.text) }; const job = normalizeJob(jobInput); const resume = normalizeResume(resumeInput); const matrix = buildEvidenceMatrix(job, resume); const score = matrix.reduce((a, r) => a + r.earnedScore, 0); const assessment = generateAssessment(job, matrix, score); const studyGuide = generateStudyGuide(job, matrix); normalizedJobSchema.parse(job); normalizedResumeSchema.parse(resume); const audit = auditOutputs(matrix, assessment, studyGuide, score, { candidate: resume.candidateName, role: job.title, employer: job.employer }); evidenceRowSchema.array().parse(matrix); auditResultSchema.parse(audit); return { id: `analysis-${Date.now()}`, job, resume, matrix, score, assessment, studyGuide, audit, provider, model, createdAt: Date.now() }; }

export function safeFileName(candidate: string | null, role: string | null, suffix: string): string { return `${(candidate || "Candidate").replace(/[^A-Za-z0-9]+/g, "_")}_${(role || "Role").replace(/[^A-Za-z0-9]+/g, "_")}_${suffix}`.replace(/_+/g, "_"); }
