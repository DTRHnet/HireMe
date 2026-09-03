import type { EvidenceRow, NormalizedJob, NormalizedResume } from "./hireme";

export function buildAssessmentPrompt(
  job: NormalizedJob,
  resume: NormalizedResume,
  matrix: EvidenceRow[],
  score: number
): { system: string; user: string } {
  const candidateName = resume.candidateName || "Candidate";
  const jobTitle = job.title || "Target Role";
  const employer = job.employer || "Employer";
  const currentDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const system = `You are HireMe's elite Executive Talent Assessor and Evidence-Based Career Strategist.
Your mandate is to generate an exhaustive, rigorous, and deeply structured "Resume Fit Assessment" in standard GitHub Flavored Markdown.

CRITICAL METHODOLOGICAL PRINCIPLES:
1. EVIDENCE BOUNDARY: Never invent facts, credentials, degrees, employers, metrics, or direct ownership not explicitly verified in the provided candidate resume text.
2. HONEST TAXONOMY: Clearly distinguish between "Explicit direct evidence", "Strongly implied / Transferable experience", "Weakly implied indicators", and "Absent / Unstated criteria".
3. NO EMPTY PLACEHOLDERS: Generate real, richly articulated analysis for every section based directly on the provided Job Description and Resume.
4. EXACT STRUCTURE: Follow the mandatory 9-section report architecture precisely. Use markdown tables, bold highlights, blockquotes, and clean headings.`;

  const user = `Generate a complete, exhaustive "Resume Fit Assessment" report adhering strictly to the following 9-section structure.

# Resume Fit Assessment
## ${jobTitle} — ${employer}
**Prepared for ${candidateName}**
Detailed role-fit analysis based on the supplied job description and resume
Prepared by HireMe • ${currentDate}

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
- Provide a clear, thorough narrative evaluating the overall documented-fit score (${score}/100) and overall match level.
- Detail why this profile represents a strong/transferable/gap-heavy fit against the core mandate of ${jobTitle}.
- Discuss key areas of competitive advantage versus primary evidence gaps where interview panel probing will concentrate.
- Explicitly distinguish between evidence gaps in the written resume versus true candidate capability.
- Include a highlighted blockquote:
> **Bottom line**
> [1-2 high-impact sentences providing the executive summary, candidate market positioning, and core interview burden]

## 2. Weighted scoring rubric
Provide a clean Markdown table summarizing the evaluation across 8-10 major core dimensions that sum to 100 points total:
| Area | Weight | Score | Assessment |
(Populate all rows based on the evidence matrix categories, e.g. Education & Credentials, Core Domain Experience, Leadership & Management, Daily Operations, HR/Labour Relations, Domain-Specific Relevance, Governance/Legislation/Risk, Quality Improvement/Data/Tech, Communication & Stakeholder Leadership).

## 3. Detailed fit analysis
Provide exhaustive, structured subsections for every single dimension in the rubric:
### 3.1 1. [Area Title] — [Earned]/[Weight]
- **Posting Requirement:** [Specific requirements and expectations from the job description]
- **Documented Resume Evidence:** [Exact candidate credentials, roles, employers, dates, and bulleted achievements cited from the resume]
- **Evidence Assessment:** [Honest evaluation of evidence strength: Explicit / Strongly implied / Weakly implied / Absent]
- **Interview Implication & Focus:** [Exact areas that require verification, scope clarification, or defence during the interview]
(Repeat for all rubric dimensions 3.1 through 3.8/3.9).

## 4. Key strengths to emphasize
Provide 4-6 detailed strategic strengths with evidence-backed framing:
- Bulleted items highlighting the candidate's strongest verified assets, showing exactly how to present each strength to the panel.

## 5. Main interview risks and how to manage them
Provide 4-6 specific risk-management subsections addressing likely panel skepticism or unstated resume gaps:
### 5.1 Risk 1: "[Panel's exact question or objection in quotes]"
- **Panel Concern:** [What the committee is secretly worried about]
- **Response Strategy & Talk Track:** [Step-by-step guidance on how the candidate should answer, what transferable experience to cite, and how to define a safe process without overclaiming]
(Include Risk 5.1 through 5.5).

## 6. Interview-ready positioning statement
Provide a polished 60–90 second elevator pitch / opening narrative that connects the candidate's verified history to the ${jobTitle} mandate while maintaining an honest evidence boundary.

## 7. Final recommendation
Deliver direct, actionable career advice regarding candidate readiness, application viability, and risk-mitigation strategy.

## 8. Immediate preparation checklist
Provide a bulleted list of 5-7 concrete, practical preparation steps for the candidate before the interview.

## 9. Method and source note
Include the standard HireMe transparency disclosure confirming that this assessment reflects visible evidence from the supplied job posting and resume.

---
TARGET JOB CONTEXT:
Title: ${jobTitle}
Employer: ${employer}
Location: ${job.location || "Not specified"}

JOB DESCRIPTION:
${job.rawText}

---
CANDIDATE PROFILE:
Name: ${candidateName}

CANDIDATE RESUME:
${resume.rawText}

---
EVIDENCE MATRIX & DOCUMENTED SCORE:
Overall Score: ${score} / 100
Matrix Breakdown:
${JSON.stringify(matrix, null, 2)}
`;

  return { system, user };
}

export function buildStudyGuidePrompt(
  job: NormalizedJob,
  resume: NormalizedResume,
  matrix: EvidenceRow[],
  score: number
): { system: string; user: string } {
  const candidateName = resume.candidateName || "Candidate";
  const jobTitle = job.title || "Target Role";
  const employer = job.employer || "Employer";

  const system = `You are HireMe's Master Executive Interview Coach and Strategic Advisor.
Your mandate is to generate an exhaustive, high-yield, and deeply practical "Interview Study Guide" in standard GitHub Flavored Markdown.

CRITICAL COACHING PRINCIPLES:
1. EVIDENCE INTEGRITY: Ground every recommendation and model story in the candidate's actual history from the supplied resume.
2. REAL TALK TRACKS: When direct experience is missing, provide bounded, transferable response structures that acknowledge boundaries and describe structured problem-solving processes.
3. CONCRETE STORY BANK: Draft complete, rich STAR/SOAR stories based on real resume roles and achievements.
4. EXACT STRUCTURE: Adhere strictly to the standard 11-section HireMe Study Guide architecture.`;

  const user = `Generate a complete, exhaustive "Interview Study Guide" adhering strictly to the following 11-section structure.

# Interview Study Guide
## ${jobTitle} — ${employer}
**Candidate:** ${candidateName}
**Purpose:** Same-day preparation for the interview

## 1. What the panel is likely looking for
- Detailed breakdown of the operational reality, organizational culture, strategic mandate, and environment of ${employer}.
- Analysis of the multi-dimensional balance expected in the role (quality/service delivery, risk/compliance, staff leadership, stakeholder navigation, change management, budget).
- Panel composition, interview panel mindset, and evaluation benchmarks.

## 2. Your strongest fit with the posting
Provide a comprehensive Markdown table with 6-10 rows mapping key posting requirements to candidate evidence:
| Requirement or responsibility | Evidence from your resume | How to position it in the interview |

## 3. 60–90 second opening answer
Provide a fully scripted, natural, high-impact model answer for "Tell us about yourself and why you are interested in this role" that weaves verified history, credentials, and genuine enthusiasm.

## 4. Core interview stories to prepare (STAR / SOAR format)
Draft 5 complete, detailed, ready-to-use stories mapped to the candidate's actual employers and roles from the resume:
- **Story 1: Operational Leadership & Reliable Service Delivery**
- **Story 2: Staff Performance, Workforce Management & Team Culture**
- **Story 3: Systems Rollout, Technology Adoption & Change Leadership**
- **Story 4: Quality Improvement, Data Analysis & Risk Mitigation**
- **Story 5: Complex Crisis Escalation, Conflict Resolution & High-Stakes Stakeholder Management**

Format each story with:
- **Competency & Theme:**
- **Context & Employer:**
- **Situation & Challenge:**
- **Action taken (Candidate's personal ownership):**
- **Result & Impact (with verified metrics/outcomes):**
- **Key Leadership Takeaway:**

## 5. Addressing evidence gaps & sensitive questions
Provide concrete, bulleted talk tracks for handling missing direct experience without lying or getting defensive (e.g. direct domain management, specialized legislation, formal labour relations/discipline).

## 6. Key terminology, legislation, frameworks & acronyms to use naturally
Provide a structured Markdown table:
| Concept / Term / Legislation | Meaning & Context | How to weave into answers |
(Include relevant Acts, standards, frameworks, KPIs, and methodologies relevant to ${jobTitle} and ${employer}).

## 7. High-yield behavioural & situational mock questions with model answer outlines
Provide 6-8 realistic interview questions covering core leadership domains. Format each question with:
- **Question:**
- **What the panel is testing:**
- **Core response architecture & talking points:**
- **Follow-up probes to expect:**

## 8. Strategic questions to ask the panel
Provide a structured Markdown table with 6-8 insightful, high-value questions:
| Question | Why it is useful |

## 9. Same-day preparation schedule
Provide a timed preparation countdown breakdown:
- **First 20 minutes:** Opening answer & core message rehearsal.
- **Next 30 minutes:** 5 STAR story reviews and verified metrics.
- **Next 20 minutes:** Domain terminology, legislation, and gap defense practice.
- **Final 15 minutes:** Rapid review checklist, panel questions, and closing statement.

## 10. Final rapid-review checklist & Closing statement
- Bulleted pre-interview rapid checklist reminders.
- Fully scripted, word-for-word Closing Statement.

## 11. Source note
Standard HireMe bounded evidence disclaimer.

---
TARGET JOB CONTEXT:
Title: ${jobTitle}
Employer: ${employer}
Location: ${job.location || "Not specified"}

JOB DESCRIPTION:
${job.rawText}

---
CANDIDATE PROFILE:
Name: ${candidateName}

CANDIDATE RESUME:
${resume.rawText}

---
EVIDENCE MATRIX & DOCUMENTED SCORE:
Overall Score: ${score} / 100
Matrix Breakdown:
${JSON.stringify(matrix, null, 2)}
`;

  return { system, user };
}
