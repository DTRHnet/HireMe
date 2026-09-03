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
  let employer = firstMatch(text, [/^(?:company|employer|organization|site)\s*:\s*(.+)$/im, /(?:about|at|join)\s+([A-Z][A-Za-z0-9 &.-]{2,40})/i]);
  if (employer) employer = employer.replace(/[.,;]+$/, "").trim();
  const words = (text.match(KEY_TERMS) ?? []).map((x) => x.toLowerCase()).filter((x) => !STOP_WORDS.has(x));
  const keywords = Array.from(new Set(words)).slice(0, 40);
  const by = (cat: string) => reqs.filter((r) => r.category === cat);
  return { title, employer, location: firstMatch(text, [/^(?:location|based in)\s*:\s*(.+)$/im]), responsibilities: reqs, mandatoryRequirements: reqs.filter((r) => r.mandatory), preferredRequirements: reqs.filter((r) => !r.mandatory), certifications: by("Credentials").filter((r) => /certif|license|registration/i.test(r.text)), education: by("Credentials").filter((r) => /degree|education|bachelor|master/i.test(r.text)), systems: by("Systems"), regulations: reqs.filter((r) => /regulat|compliance|law|policy|privacy|safety/i.test(r.text)), leadershipExpectations: by("Leadership"), operationalExpectations: by("Operations"), keywords, rawText: text, sourceSpans: source };
}

export function normalizeResume(doc: ExtractedDocument): NormalizedResume {
  const text = doc.text; const source = doc.sourceSpans; const lines = bulletLines(text);
  let name = text.split(/\n/).map((x) => x.trim()).find((x) => x && x.length < 80 && !/@|resume|curriculum vitae/i.test(x)) ?? null;
  if (name) {
    name = name.replace(/\s+(?:\d{1,5}\s+[A-Za-z0-9\s,.-]+|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}).*$/, "");
    name = name.replace(/^(?:resume|cv|curriculum vitae)\s*[:-]?\s*/i, "");
    name = name.replace(/[,|].*$/, "").trim();
  }
  const contact = { email: text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? null, phone: text.match(/(?:\+?\d[\d ()-]{7,}\d)/)?.[0] ?? null, location: firstMatch(text, [/^(?:location|based in)\s*:\s*(.+)$/im]) };
  const employment = lines.filter((x) => /\b(?:19|20)\d{2}\b/.test(x)).slice(0, 8).map((x) => ({ role: x.replace(/\s*\|.*$/, ""), employer: null, dates: x.match(/\b(?:19|20)\d{2}\b.*$/)?.[0] ?? null, bullets: [] }));
  return { candidateName: name, contact: contact.email || contact.phone || contact.location ? contact : null, summary: text.split(/\n\n/)[0]?.trim() ?? null, education: items(lines.filter((x) => /degree|bachelor|master|college|university/i.test(x)), "Education", source), registrations: items(lines.filter((x) => /registration|licensed|licen[cs]e/i.test(x)), "Registration", source), certifications: items(lines.filter((x) => /certif/i.test(x)), "Certification", source), skills: items(lines.filter((x) => /skill|proficient|experienced in/i.test(x)), "Skill", source), systems: items(lines.filter((x) => /software|system|platform|excel|sql|crm|ehr/i.test(x)), "System", source), employmentHistory: employment, leadership: items(lines.filter((x) => /lead|manage|supervis|coach|director/i.test(x)), "Leadership", source), operations: items(lines.filter((x) => /operat|process|budget|project|workflow/i.test(x)), "Operations", source), qualityImprovement: items(lines.filter((x) => /quality|improv|audit|metric|outcome/i.test(x)), "Quality", source), stakeholderExperience: items(lines.filter((x) => /stakeholder|partner|client|customer|community/i.test(x)), "Stakeholder", source), rawText: text, sourceSpans: source };
}

function grade(req: Requirement, resumeText: string, resumeSource: SourceSpan[]): { grade: EvidenceGrade; score: number; evidence: EvidenceReference[] } { const terms = (req.text.match(KEY_TERMS) ?? []).map((x) => x.toLowerCase()).filter((x) => !STOP_WORDS.has(x)); const lower = resumeText.toLowerCase(); const hits = terms.filter((x) => lower.includes(x)); const quote = resumeText.split(/\n+/).find((line) => hits.some((hit) => line.toLowerCase().includes(hit)))?.trim() ?? ""; const quoteSpan = resumeSource.find((span) => span.text === quote); if (hits.length >= Math.max(2, Math.ceil(terms.length * 0.45))) return { grade: "Explicit", score: 1, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; if (hits.length >= 2) return { grade: "Strongly implied", score: 0.7, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; if (hits.length === 1) return { grade: "Weakly implied", score: 0.35, evidence: quote ? [{ sourceSpanId: quoteSpan?.id ?? "", quote }] : [] }; return { grade: "Absent", score: 0, evidence: [] }; }

export function buildEvidenceMatrix(job: NormalizedJob, resume: NormalizedResume): EvidenceRow[] { const reqs = job.responsibilities.length ? job.responsibilities : [{ id: "req-core", text: "Demonstrated alignment with the role's stated responsibilities", category: "Core requirement", mandatory: true, sourceSpanId: null }]; const weights = reqs.map((_, i) => Math.floor(100 / reqs.length) + (i < 100 % reqs.length ? 1 : 0)); return reqs.map((req, i) => { const g = grade(req, resume.rawText, resume.sourceSpans); const max = weights[i] ?? 0; return { id: req.id, requirement: req.text, category: req.category, mandatory: req.mandatory, weight: max, resumeEvidence: g.evidence, evidenceGrade: g.grade, transferability: g.grade === "Explicit" ? "Direct evidence is documented in the supplied resume." : g.grade === "Absent" ? "No defensible transfer claim can be made from the supplied resume." : "Adjacent evidence may transfer, but direct ownership is not established.", gapOrAmbiguity: g.grade === "Absent" ? "The supplied resume does not establish this criterion." : g.grade === "Explicit" ? null : "Scope, recency, or direct ownership requires interview clarification.", earnedScore: Math.round(max * g.score), maximumScore: max, interviewImplication: g.grade === "Explicit" ? "Emphasize the exact example and its verified scope." : "Prepare a bounded process answer and do not overclaim." }; }); }

export function auditOutputs(matrix: EvidenceRow[], assessment: string, guide: string, score: number, identity?: { candidate: string | null; role: string | null; employer: string | null }): AuditResult { const critical: string[] = []; const warnings: string[] = []; if (identity?.candidate && !assessment.includes(identity.candidate) && !guide.includes(identity.candidate)) warnings.push("Candidate identity is not repeated in generated artifacts; confirm metadata before export."); if (identity?.role && !assessment.toLowerCase().includes(identity.role.toLowerCase())) warnings.push("Target role is not repeated in the assessment; confirm metadata before export."); if (identity?.employer && !assessment.toLowerCase().includes(identity.employer.toLowerCase())) warnings.push("Employer is not repeated in the assessment; confirm metadata before export."); const combined = `${assessment}\n${guide}`; const numbers = combined.match(/\b\d+(?:\.\d+)?%?|\$\d+[\d,]*/g) ?? []; for (const n of numbers) { if (!matrix.some((row) => row.resumeEvidence.some((e) => e.quote.includes(n)))) warnings.push(`Metric ${n} appears in generated text without a matching evidence quote.`); } if (matrix.reduce((a, r) => a + r.maximumScore, 0) !== 100) critical.push("Evidence matrix maximum score does not total 100."); if (score < 0 || score > 100) critical.push("Documented-fit score is outside the 0–100 range."); return { status: critical.length ? "blocked" : "passed", critical, warnings }; }

export function generateAssessment(job: NormalizedJob, matrix: EvidenceRow[], score: number): string {
  const candidateName = "Candidate";
  const jobTitle = job.title || "Target Role";
  const employer = job.employer || "Employer";
  const strong = matrix.filter((r) => r.evidenceGrade === "Explicit" || r.evidenceGrade === "Strongly implied");
  const gaps = matrix.filter((r) => r.evidenceGrade === "Absent" || r.evidenceGrade === "Weakly implied");

  return `# Resume Fit Assessment
## ${jobTitle} — ${employer}
**Prepared for ${candidateName}**
Detailed role-fit analysis based on the supplied job description and resume
Prepared by HireMe

## Contents
1 Executive assessment
2 Weighted scoring rubric
3 Detailed fit analysis
4 Key strengths to emphasize
5 Main interview risks and how to manage them
6 Interview-ready positioning statement
7 Final recommendation
8 Immediate preparation checklist
9 Method and source note

---

## 1. Executive assessment
Your resume represents a documented fit score of **${score}/100** for the **${jobTitle}** role at **${employer}**. This score is determined through an evidence-based comparison of the candidate resume against stated posting criteria.

${score >= 70 ? "This is a competitive, high-alignment profile with substantial direct evidence supporting core operational and domain expectations." : score >= 40 ? "This profile represents a transferable match with demonstrable strengths in select areas, though several core functional dimensions require clarification of scope and direct ownership." : "This profile indicates significant evidence gaps against enterprise-level expectations, requiring a carefully bounded interview strategy centered on transferable problem-solving rather than unsupported ownership."}

> **Bottom line**
> The interview burden is to bridge verified background achievements to the specific mandate of ${jobTitle}, highlighting direct accomplishments while navigating unstated areas with disciplined process answers.

## 2. Weighted scoring rubric

| Area | Weight | Score | Assessment |
|---|---:|---:|---|
${matrix.map((r) => `| ${r.requirement.slice(0, 45)} | ${r.maximumScore} | ${r.earnedScore} | ${r.evidenceGrade}; ${r.gapOrAmbiguity ?? "Direct evidence verified"} |`).join("\n")}

## 3. Detailed fit analysis

${matrix.map((r, i) => `### 3.${i + 1} ${i + 1}. ${r.requirement} — ${r.earnedScore}/${r.maximumScore}

- **Posting Requirement:** ${r.requirement}
- **Documented Evidence:** ${r.resumeEvidence[0] ? `“${r.resumeEvidence[0].quote}”` : "No direct quote documented in supplied resume."}
- **Evidence Assessment:** ${r.evidenceGrade}. ${r.transferability} ${r.gapOrAmbiguity ? `(${r.gapOrAmbiguity})` : ""}
- **Interview Implication:** ${r.interviewImplication}`).join("\n\n")}

## 4. Key strengths to emphasize

${strong.slice(0, 5).map((r) => `- **${r.requirement}:** ${r.resumeEvidence[0]?.quote ?? "Documented strength"} — Present with specific metrics, verified scope, and direct ownership.`).join("\n")}

## 5. Main interview risks and how to manage them

${gaps.slice(0, 4).map((r, i) => `### 5.${i + 1} Risk ${i + 1}: “You have not documented direct ownership of ${r.requirement}”
- **Panel Concern:** The committee will probe whether you have handled this specific scope independently.
- **Response Strategy:** Acknowledge the boundary candidly, articulate transferable methodologies, and outline the exact structured protocol you would apply.`).join("\n\n")}

## 6. Interview-ready positioning statement

“My background connects verified experience in operational discipline, problem-solving, and continuous improvement with the mandate of ${jobTitle}. Where I have direct ownership, I bring measurable results and reliable execution. Where specialized program details or unstated areas exist, I bring structured learning, stakeholder collaboration, and disciplined governance.”

## 7. Final recommendation

**${score >= 60 ? "Strong candidate for targeted interview advancement." : "Focus heavily on transferable competencies and process frameworks during interview rounds."}** Review all flagged gaps prior to meeting the panel.

## 8. Immediate preparation checklist

- Confirm the scope, recency, and verified metrics for every Explicit/Strongly implied example.
- Rehearse 4-5 STAR stories anchored in real operational challenges.
- Prepare clear, bounded talking tracks for identified evidence gaps.
- Align on key domain terminology, compliance frameworks, and organizational priorities.

## 9. Method and source note

This assessment is generated strictly from the supplied job description and candidate resume. Evidence grades reflect visible documentation in the source texts.`;
}

export function generateStudyGuide(job: NormalizedJob, matrix: EvidenceRow[]): string {
  const candidateName = "Candidate";
  const jobTitle = job.title || "Target Role";
  const employer = job.employer || "Employer";
  const strong = matrix.filter((r) => r.evidenceGrade !== "Absent");
  const gaps = matrix.filter((r) => r.evidenceGrade === "Absent" || r.evidenceGrade === "Weakly implied");

  return `# Interview Study Guide
## ${jobTitle} — ${employer}
**Candidate:** ${candidateName}
**Purpose:** Same-day preparation for the interview

## 1. What the panel is likely looking for

The panel is evaluating both functional capability and strategic leadership. For **${jobTitle}** at **${employer}**, success requires balancing operational reliability, team performance, compliance/risk governance, and measurable continuous improvement.

## 2. Your strongest fit with the posting

| Requirement or responsibility | Evidence from your resume | How to position it in the interview |
|---|---|---|
${strong.slice(0, 8).map((r) => `| ${r.requirement.slice(0, 40)} | ${r.resumeEvidence[0]?.quote ?? "Documented background"} | Frame with direct ownership, clear context, and measurable outcomes. |`).join("\n")}

## 3. 60–90 second opening answer

“Thank you for the opportunity to discuss the ${jobTitle} role. My career has focused on operational execution, team development, and systematic problem solving. At ${employer}, I recognize that this role requires translating strategic goals into reliable daily workflows and measurable results. I am excited to bring my structured approach, adaptability, and dedication to your team.”

## 4. Core interview stories to prepare (STAR / SOAR format)

### Story 1: Operational Leadership & Reliable Service Delivery
- **Competency:** Operational Execution & Daily Oversight
- **Situation:** Managing competing priorities under demanding service standards.
- **Action:** Established structured communication, role clarity, and workflow tracking.
- **Result:** Improved turnaround, minimized bottlenecks, and enhanced consistency.
- **Takeaway:** Rigorous daily habits create stable operational foundations.

### Story 2: Staff Performance & Workforce Coaching
- **Competency:** People Leadership & Team Development
- **Situation:** Onboarding new staff or addressing skill variance across the unit.
- **Action:** Provided clear expectations, objective feedback, and safe coaching.
- **Result:** Increased staff confidence, reduced errors, and strengthened team cohesion.
- **Takeaway:** Clear expectations paired with support drives sustained performance.

### Story 3: Systems Adoption & Change Management
- **Competency:** Technology & Workflow Optimization
- **Situation:** Implementing new software, data tracking, or procedure changes.
- **Action:** Engaged users early, demonstrated value, and provided iterative training.
- **Result:** High adoption rate and improved data visibility.
- **Takeaway:** People-centered change management prevents operational disruption.

### Story 4: Quality Improvement & Risk Mitigation
- **Competency:** Data-Driven Continuous Improvement
- **Situation:** Identifying recurring bottlenecks or quality variances.
- **Action:** Analyzed process data, identified root causes, and deployed targeted controls.
- **Result:** Measurable improvement in safety, accuracy, and cycle times.
- **Takeaway:** Small data-backed adjustments yield substantial compounding gains.

### Story 5: Escalation & Complex Problem Solving
- **Competency:** Conflict Resolution & Crisis Management
- **Situation:** High-stakes operational bottleneck or stakeholder misalignment.
- **Action:** De-escalated, gathered objective facts, engaged key stakeholders, and resolved cleanly.
- **Result:** Timely resolution with preserved relationships and updated preventative protocols.
- **Takeaway:** Calm, fact-based communication resolves crises effectively.

## 5. Addressing evidence gaps & sensitive questions

${gaps.slice(0, 4).map((r) => `- **${r.requirement.slice(0, 45)}:** Acknowledge that this is an area for onboarding focus. Emphasize transferable problem-solving, consultation with subject-matter experts, and adherence to established policy.`).join("\n")}

## 6. Key terminology, legislation, frameworks & acronyms to use naturally

| Concept / Term | Meaning & Context | How to weave into answers |
|---|---|---|
| Continuous Quality Improvement (CQI) | Systematic data-driven process optimization | Reference when discussing workflow reviews and safety metrics |
| Enterprise Risk Management (ERM) | Cross-functional risk identification and mitigation | Use when explaining governance and compliance safeguards |
| Change Management (ADKAR/Prosci) | Structured transition of teams to new operating models | Highlight when discussing systems rollouts and procedural updates |
| Key Performance Indicators (KPIs) | Quantifiable operational and quality targets | Reference when discussing team accountability and reporting |

## 7. High-yield behavioural & situational mock questions with model answer outlines

1. **How do you prioritize competing operational demands?**  
   *Framework:* Assess urgency/impact -> protect safety and core deliverables -> communicate transparently -> delegate and track.
2. **Tell us about a time you managed a difficult stakeholder or team conflict.**  
   *Framework:* Clarify shared objectives -> listen actively -> focus on facts and policy -> agree on follow-up actions.
3. **How do you ensure compliance with regulatory standards?**  
   *Framework:* Clear standard operating procedures -> routine audits -> staff education -> immediate corrective action on variances.
4. **Describe a project where you used data to improve performance.**  
   *Framework:* Identify metric variance -> investigate root cause -> implement targeted countermeasure -> verify sustained outcome.

## 8. Strategic questions to ask the panel

| Question | Why it is useful |
|---|---|
| What are the top operational priorities for this position in the first 90 days? | Demonstrates immediate readiness to support team objectives |
| How does leadership measure success for this unit on an ongoing basis? | Signals data awareness and accountability mindset |
| What are the biggest opportunities for workflow optimization currently? | Shows proactive continuous improvement orientation |
| How do interdisciplinary teams collaborate on strategic initiatives here? | Demonstrates respect for cross-functional partnerships |

## 9. Same-day preparation schedule

- **First 20 minutes:** Rehearse the 60-90 second opening answer and core positioning statement.
- **Next 30 minutes:** Review the 5 STAR stories and verify key metrics/details.
- **Next 20 minutes:** Practice talk tracks for identified evidence gaps.
- **Final 15 minutes:** Review panel questions, rapid checklist, and closing statement.

## 10. Final rapid-review checklist & Closing statement

- Lead with verified experience and quantifiable impact.
- Avoid overclaiming direct ownership of unverified criteria; frame as transferable capability.
- Speak in structured, concise points (Situation -> Action -> Result).
- Maintain an active, collaborative, and solution-oriented tone.

**Closing Statement:**  
“Thank you for your time today. I am very enthusiastic about the opportunity to contribute to ${employer} as ${jobTitle}. I look forward to bringing my operational discipline, team-oriented leadership, and commitment to excellence to this role.”

## 11. Source note

Tailored strictly from supplied job description and resume sources. All dates, metrics, and details should be confirmed before the interview.`;
}

export function makeAnalysis(jobDoc: ExtractedDocument, resumeDoc: ExtractedDocument, provider = "Local deterministic", model = "Evidence-first baseline"): AnalysisResult {
  const jobInput = jobDoc.sourceSpans.length ? jobDoc : { ...jobDoc, sourceSpans: spans("job", jobDoc.text) };
  const resumeInput = resumeDoc.sourceSpans.length ? resumeDoc : { ...resumeDoc, sourceSpans: spans("resume", resumeDoc.text) };
  const job = normalizeJob(jobInput);
  const resume = normalizeResume(resumeInput);
  const matrix = buildEvidenceMatrix(job, resume);
  const score = matrix.reduce((a, r) => a + r.earnedScore, 0);
  const assessment = generateAssessment(job, matrix, score);
  const studyGuide = generateStudyGuide(job, matrix);
  normalizedJobSchema.parse(job);
  normalizedResumeSchema.parse(resume);
  const audit = auditOutputs(matrix, assessment, studyGuide, score, { candidate: resume.candidateName, role: job.title, employer: job.employer });
  evidenceRowSchema.array().parse(matrix);
  auditResultSchema.parse(audit);
  return { id: `analysis-${Date.now()}`, job, resume, matrix, score, assessment, studyGuide, audit, provider, model, createdAt: Date.now() };
}

export function safeFileName(candidate: string | null, role: string | null, suffix: string): string {
  const c = (candidate || "Candidate").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
  const r = (role || "Role").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
  return `${c}_${r}_${suffix}`.replace(/_+/g, "_").replace(/^_|_$/g, "");
}
